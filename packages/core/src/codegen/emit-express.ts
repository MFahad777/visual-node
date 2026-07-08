import type { Flow, FlowEdge } from "../schema/node.types.js";
import { requireNodeDefinition, type EmitContext, type EmittedCode } from "../schema/node-registry.js";
import { validateFlow, getConstVariablesOverriddenFromBegin } from "../schema/validate.js";
import { topologicalSortStructuralNodes, collectLogicNodes } from "./graph-walker.js";
import { buildVariableDeclarationStatement } from "./variable-declarations.js";

export interface EmitResult {
  code: string;
}

function buildEmitContext(flow: Flow): EmitContext {
  const nodesById = new Map(flow.nodes.map((n) => [n.id, n]));
  const cache = new Map<string, EmittedCode>();

  const matchesHandle = (edge: FlowEdge, side: "source" | "target", handle?: string) =>
    handle === undefined || (side === "source" ? edge.sourceHandle : edge.targetHandle) === handle;

  const ctx: EmitContext = {
    flow,
    getNode: (nodeId) => nodesById.get(nodeId),
    getIncoming: (nodeId, handle) =>
      flow.edges.filter((e) => e.target === nodeId && matchesHandle(e, "target", handle)),
    getOutgoing: (nodeId, handle) =>
      flow.edges.filter((e) => e.source === nodeId && matchesHandle(e, "source", handle)),
    emitNode: (nodeId) => {
      const cached = cache.get(nodeId);
      if (cached) return cached;
      const node = nodesById.get(nodeId);
      if (!node) throw new Error(`emitNode: unknown node id "${nodeId}"`);
      const def = requireNodeDefinition(node.type);
      const emitted = def.emit(node, ctx);
      cache.set(nodeId, emitted);
      return emitted;
    },
  };

  return ctx;
}

/**
 * Compiles a flow graph targeting Express into a single generated `server.js` source string.
 * Throws if the flow fails structural validation — codegen never silently emits broken code.
 */
export function emitExpress(flow: Flow): EmitResult {
  const validation = validateFlow(flow);
  if (!validation.valid) {
    const details = validation.errors.map((e) => (e.nodeId ? `[${e.nodeId}] ${e.message}` : e.message)).join("\n");
    throw new Error(`Cannot generate code: flow is invalid.\n${details}`);
  }

  const structuralOrder = topologicalSortStructuralNodes(flow);
  const logicNodes = collectLogicNodes(flow);
  const ctx = buildEmitContext(flow);

  const imports = new Set<string>();
  const setupFragments: { order: number; setup: string }[] = [];

  // Module-level variable declarations (Phase 10): order 1, after express.init's 0 and before
  // logic.function's 5 — though since function declarations hoist, anywhere before
  // express.listen's 100 is actually safe. Skip variables that are overridden by a Set node
  // from Begin — the Set node's own declaration will replace the default.
  const overriddenVarIds = getConstVariablesOverriddenFromBegin(flow);
  for (const variable of flow.variables ?? []) {
    if (overriddenVarIds.has(variable.id)) continue;
    const setup = buildVariableDeclarationStatement(variable);
    if (setup) setupFragments.push({ order: 1, setup });
  }

  for (const node of [...structuralOrder, ...logicNodes]) {
    const emitted = ctx.emitNode(node.id);
    for (const imp of emitted.imports ?? []) imports.add(imp);
    if (emitted.setup) setupFragments.push({ order: emitted.order, setup: emitted.setup });
  }

  // Stable sort: preserves topological (dependency-correct) order among equal `order` values,
  // while still pushing e.g. `express.listen` (order 100) after everything else.
  setupFragments.sort((a, b) => a.order - b.order);

  const sections = [
    Array.from(imports).join("\n"),
    setupFragments.map((f) => f.setup).join("\n\n"),
  ].filter((s) => s.length > 0);

  return { code: sections.join("\n\n") + "\n" };
}
