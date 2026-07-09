import type { FlowEdge, FlowNode, VariableDeclaration } from "../schema/node.types.js";
import { requireNodeDefinition, type EmitContext, type EmittedCode } from "../schema/node-registry.js";
import { emitExecChain, hoistValueDepsCore } from "./exec-chain.js";
import { CycleError, topologicalSort } from "./topo-sort.js";
import { buildVariableDeclarationStatement } from "./variable-declarations.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface FunctionGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** This Function's own function-local variables, declared independently from the main
   * canvas's `flow.variables` (a same-named local and module-level variable never collide —
   * see docs/phase10-variables-plan.md). Optional for backward compatibility with graphs saved
   * before Phase 10. Phase 24: `variable.get`/`variable.set` nodes inside this graph may ALSO
   * resolve against the outer module-level variables (see `emitFunctionGraphBody`'s
   * `outerVariables` parameter) — only declaration validation/emission stays scoped to this
   * list alone. */
  variables?: VariableDeclaration[];
}

/**
 * Raised while compiling a function's blueprint body graph. `nodeId` (when present) points
 * at the specific node *inside* the nested graph that caused the failure, distinct from the
 * outer Function node's id — callers re-attribute both up the chain (see `function.node.ts`
 * and `ProjectFileError.blueprintNodeId`).
 */
export class FunctionGraphError extends Error {
  constructor(
    message: string,
    public readonly nodeId?: string,
  ) {
    super(message);
  }
}

export function sanitizeIdentifier(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/**
 * The identifier another node (in the same blueprint graph, or on the main canvas)
 * references to read one of this node's output values. Dispatches to the node type's own
 * `resultIdentifier` hook (declared on its `NodeDefinition`) rather than a hardcoded type
 * switch — this is what lets new value-producing node types (operators, `logic.graphEntry`,
 * `logic.functionCall`, ...) plug in without editing this file. `handle`
 * is only meaningful for a node with multiple named value outputs (today: only
 * `logic.graphEntry`, one value per function parameter) — every other case ignores it.
 */
export function resultIdentifierFor(node: FlowNode, handle?: string, ctx?: EmitContext): string {
  const def = requireNodeDefinition(node.type);
  if (!def.resultIdentifier) {
    throw new FunctionGraphError(`Node type "${node.type}" produces no reusable value`, node.id);
  }
  const identifier = def.resultIdentifier(node, handle, ctx);
  if (!IDENTIFIER_RE.test(identifier)) {
    throw new FunctionGraphError(`Node "${node.id}" (${node.type}) has an invalid identifier "${identifier}"`, node.id);
  }
  return identifier;
}

function buildGraphEmitContext(graph: FunctionGraph, outerVariables: VariableDeclaration[] = []): EmitContext {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const cache = new Map<string, EmittedCode>();

  const matchesHandle = (edge: FlowEdge, side: "source" | "target", handle?: string) =>
    handle === undefined || (side === "source" ? edge.sourceHandle : edge.targetHandle) === handle;

  // A `variable.get`/`variable.set` node's `resultIdentifier`/`emit()` look up `data.variableId`
  // against `ctx.flow.variables` — merging this graph's own local variables with the outer
  // module-level ones (local wins on id collision, though ids are UUIDs so collisions in
  // practice never happen) lets a Handler Function's blueprint graph read/write module-level
  // state declared via the main canvas's Variables panel, not just its own function-local
  // variables. The outer variables are NOT re-declared here — `emit-express.ts` already emits
  // their module-level `const`/`let`/`var` statement once; only THIS graph's own `variables`
  // get a declaration statement inside the compiled function body (see below).
  const mergedVariables = [...outerVariables, ...(graph.variables ?? [])];

  const ctx: EmitContext = {
    // Function-graph nodes never reference the outer/top-level Flow — this stub satisfies
    // EmitContext's shape without pretending the nested graph is a real top-level flow.
    flow: { version: "1", meta: { name: "", target: "express" }, nodes: graph.nodes, edges: graph.edges, variables: mergedVariables },
    getNode: (nodeId) => nodesById.get(nodeId),
    getIncoming: (nodeId, handle) => graph.edges.filter((e) => e.target === nodeId && matchesHandle(e, "target", handle)),
    getOutgoing: (nodeId, handle) => graph.edges.filter((e) => e.source === nodeId && matchesHandle(e, "source", handle)),
    emitNode: (nodeId) => {
      const cached = cache.get(nodeId);
      if (cached) return cached;
      const node = nodesById.get(nodeId);
      if (!node) throw new FunctionGraphError(`emitNode: unknown node id "${nodeId}"`);
      const def = requireNodeDefinition(node.type);
      try {
        const emitted = def.emit(node, ctx);
        cache.set(nodeId, emitted);
        return emitted;
      } catch (err) {
        if (err instanceof FunctionGraphError) throw err;
        throw new FunctionGraphError(err instanceof Error ? err.message : String(err), nodeId);
      }
    },
  };

  return ctx;
}

export interface FunctionGraphBodyResult {
  code: string;
  /**
   * Every `EmittedCode.imports` entry contributed by any node in this graph (directly, via a
   * hoisted value dependency, or inside a nested Branch/Switch arm) — these are file-level
   * `require()` lines, safe to bubble all the way up to the generated file's top-of-file
   * import list. Callers (`logic.function`'s `emit()`) must merge this into their own returned
   * `EmittedCode.imports` — mirrors the identical fix in `exec-chain.ts`'s `emitExecChain` for
   * the main-canvas Route handler-chain case, since a plugin node's declared `require()` line
   * would otherwise be silently dropped the same way when placed inside a Function's blueprint
   * graph instead of a Route's chain.
   */
  imports: string[];
}

/**
 * Compiles a Function node's blueprint body graph into a JS function-body string. Trusts the
 * graph as given — `validate.ts` is responsible for checking things like "every edge wired
 * from the `logic.graphEntry` node names a real parameter" before this ever runs.
 *
 * The trunk is compiled by the same recursive, branch-aware walker used for the main
 * canvas's route handler chains (`exec-chain.ts`), starting from whatever the entry node's
 * "out" pin is wired to — this is what lets a Branch/Switch node placed inside a function's
 * blueprint graph compile into a real `if`/`switch` block instead of flat statement soup.
 */
export function emitFunctionGraphBody(graph: FunctionGraph, outerVariables: VariableDeclaration[] = []): FunctionGraphBodyResult {
  const returnNodes = graph.nodes.filter((n) => n.type === "logic.graphReturn");

  // A whole-graph cycle pre-flight, independent of the reachability-based walk below: since
  // exec-chain.ts's walker only visits nodes actually reachable from the entry's exec spine
  // or hoisted as a value dependency, a cycle among nodes that happen to be otherwise
  // unreferenced (dead code) would never be visited and so would never be caught by the
  // walker's own cycle check. This whole-graph check (order is discarded — only used to
  // detect a cycle) preserves the "no cycles anywhere in this graph" guarantee regardless of
  // reachability. Return nodes are included here same as everything else — with `outputs: []`
  // they can never actually participate in a cycle.
  try {
    topologicalSort(
      graph.nodes.map((n) => n.id),
      graph.edges,
    );
  } catch (err) {
    if (err instanceof CycleError) {
      throw new FunctionGraphError("This function's blueprint graph contains a cycle", err.remainingNodeIds[0]);
    }
    throw err;
  }

  const ctx = buildGraphEmitContext(graph, outerVariables);
  const entry = graph.nodes.find((n) => n.type === "logic.graphEntry");
  const startNodeId = entry ? ctx.getOutgoing(entry.id, "out")[0]?.target : undefined;

  let trunk: ReturnType<typeof emitExecChain>;
  try {
    trunk = emitExecChain(startNodeId, ctx);
  } catch (err) {
    if (err instanceof FunctionGraphError) throw err;
    throw new FunctionGraphError(err instanceof Error ? err.message : String(err));
  }

  const statements: string[] = [];
  // Function-scoped variable declarations go at the very top of the compiled function body —
  // JS's native function-scope (or module-scope, for the main-canvas equivalent in
  // emit-express.ts) already gives "block scope unless var" for free just from where the
  // declaration is textually emitted, no extra runtime engineering needed.
  for (const variable of graph.variables ?? []) {
    try {
      const statement = buildVariableDeclarationStatement(variable);
      if (statement) statements.push(statement);
    } catch (err) {
      throw new FunctionGraphError(err instanceof Error ? err.message : String(err), variable.id);
    }
  }

  const imports: string[] = [...trunk.imports];
  if (trunk.code) statements.push(trunk.code);

  // Return nodes with no incoming "In" edge are the backward-compat fallback: the shape every
  // Return node had before it gained an exec pin at all. Each is appended as a trailing
  // `return <value>;` after the whole compiled trunk, exactly like before this feature
  // existed — a Return WITH an "In" edge was already emitted in place by `emitExecChain`'s
  // walk above and must not be touched again here. Reuses the Return node's own `emit()`
  // (via `ctx.emitNode`) rather than re-deriving the return statement by hand, so the
  // in-place and fallback paths can never disagree about how a Return compiles.
  const unwiredReturns = returnNodes.filter((n) => ctx.getIncoming(n.id, "in").length === 0);
  for (const returnNode of unwiredReturns) {
    try {
      // Reuses the trunk's `emitted` set so a value already hoisted for a trunk-level
      // consumer isn't redeclared here.
      const hoisted = hoistValueDepsCore(returnNode.id, ctx, trunk.emitted);
      statements.push(...hoisted.statements);
      imports.push(...hoisted.imports);
      const emitted = ctx.emitNode(returnNode.id);
      if (emitted.body) statements.push(emitted.body);
      if (emitted.imports) imports.push(...emitted.imports);
    } catch (err) {
      if (err instanceof FunctionGraphError) throw err;
      throw new FunctionGraphError(err instanceof Error ? err.message : String(err), returnNode.id);
    }
  }

  return { code: statements.join("\n"), imports };
}
