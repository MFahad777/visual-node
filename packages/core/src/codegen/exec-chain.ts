import type { FlowEdge, FlowNode } from "../schema/node.types.js";
import { requireNodeDefinition, type EmitContext, type NodeDefinition, type PortDefinition } from "../schema/node-registry.js";
import { resolveValuePin } from "./value-pins.js";

interface ForkArm {
  pinId: string;
  code: string;
  wired: boolean;
}

export interface SwitchCase {
  /** Stable identifier minted by editor-ui (`case-<id>` is the execution-output pin id) — independent of `value`, so editing a case's value never re-targets its wires. */
  id: string;
  /** The literal this case matches against "Selection" — user-provided, any JSON primitive (number, string, or boolean), not limited to integers. */
  value: string | number | boolean;
}

/** Reads `node.data.cases`, tolerating a missing/malformed value as "no cases yet." */
export function getSwitchCases(node: FlowNode): SwitchCase[] {
  const raw = (node.data as Record<string, unknown> | undefined)?.cases;
  return Array.isArray(raw) ? (raw as SwitchCase[]) : [];
}

export interface SequencePin {
  /** Stable identifier minted by editor-ui for every pin beyond the static "then-0". */
  id: string;
}

/** Reads `node.data.pins`, tolerating a missing/malformed value as "no extra pins yet." */
export function getSequencePins(node: FlowNode): SequencePin[] {
  const raw = (node.data as Record<string, unknown> | undefined)?.pins;
  return Array.isArray(raw) ? (raw as SequencePin[]) : [];
}

/**
 * The ordered list of this node's execution-output pin ids if it's a "fork" node (one that
 * branches into independent sub-chains instead of a single linear "out"), or `null` for
 * every other node type. Shared by the codegen walker below AND `validate.ts`'s
 * `computeArmScopes`, so the two can never disagree about what a fork node's arms are.
 */
export function getForkArmPinIds(node: FlowNode): string[] | null {
  if (node.type === "controlFlow.branch") return ["true", "false"];
  if (node.type === "controlFlow.switch") {
    return [...getSwitchCases(node).map((c) => `case-${c.id}`), "default"];
  }
  if (node.type === "controlFlow.sequence") {
    return ["then-0", ...getSequencePins(node).map((p) => `then-${p.id}`)];
  }
  return null;
}

function indent(code: string, levels = 1): string {
  let result = code;
  for (let i = 0; i < levels; i++) {
    result = result
      .split("\n")
      .map((line) => (line.length > 0 ? `  ${line}` : line))
      .join("\n");
  }
  return result;
}

function assembleIfElse(condText: string, arms: ForkArm[]): string {
  const trueArm = arms.find((a) => a.pinId === "true")!;
  const falseArm = arms.find((a) => a.pinId === "false")!;

  if (trueArm.wired && falseArm.wired) {
    return `if (${condText}) {\n${indent(trueArm.code)}\n} else {\n${indent(falseArm.code)}\n}`;
  }
  if (trueArm.wired) {
    return `if (${condText}) {\n${indent(trueArm.code)}\n}`;
  }
  // false-only wired: invert rather than emitting an empty positive branch.
  return `if (!(${condText})) {\n${indent(falseArm.code)}\n}`;
}

function assembleSwitchStatement(selectionText: string, cases: SwitchCase[], arms: ForkArm[]): string {
  const byPinId = new Map(arms.map((a) => [a.pinId, a]));
  const lines = [`switch (${selectionText}) {`];

  for (const c of cases) {
    const arm = byPinId.get(`case-${c.id}`);
    if (!arm?.wired) continue; // unwired case: no clause at all, same "does nothing" rule as Branch
    // JSON.stringify renders any of the 3 allowed primitive types as a valid JS case-label
    // literal (a quoted string, a bare number, or a bare boolean) — exactly what a `case`
    // clause needs regardless of which type the user chose for this case's value.
    lines.push(`  case ${JSON.stringify(c.value)}: {`, indent(arm.code, 2), `    break;`, `  }`);
  }

  const defaultArm = byPinId.get("default");
  if (defaultArm?.wired) {
    lines.push(`  default: {`, indent(defaultArm.code, 2), `    break;`, `  }`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Unlike assembleIfElse/assembleSwitchStatement, Sequence arms are NOT mutually exclusive —
 * every wired arm fires, unconditionally, in pin order. Each arm is wrapped in its own `{ }`
 * block purely for independent const/let scoping (consistent with each arm already getting
 * its own fresh `emitted` copy in emitBlock) — there is no conditional guarding any of them.
 * An unwired pin contributes nothing (same "unwired = does nothing" convention as Branch's
 * unwired False / Switch's unwired case).
 */
function assembleSequence(arms: ForkArm[]): string {
  return arms
    .filter((a) => a.wired)
    .map((a) => `{\n${indent(a.code)}\n}`)
    .join("\n");
}

/**
 * The node's execution-entry input port — an explicit `kind: "exec"` port, falling back to
 * the legacy `id === "in"` convention for pre-Phase-7 node types — or `undefined` if it has
 * none (a pure value node, e.g. an operator or a value-only plugin). Shared by
 * `isExecPredecessorEdge` below and `validate.ts`'s "can this node start a Route's handler
 * chain" check (Phase 9: a plugin node can declare any `NodeCategory`, so that check can no
 * longer be a hardcoded category allow-list — it must ask the same question this file
 * already answers for exec-chain walking) so the two can never disagree.
 */
export function execEntryPort(def: NodeDefinition): PortDefinition | undefined {
  return def.inputs.find((p) => p.kind === "exec") ?? def.inputs.find((p) => p.id === "in");
}

/**
 * Whether `edge` is the execution-flow predecessor edge for `targetNode` (as opposed to a
 * value dependency). Determined from the target node's own exec-input port (`kind: "exec"`,
 * falling back to the legacy `id === "in"` convention for pre-Phase-7 node types) rather
 * than a bare `targetHandle === "in"` string check, because a node with exactly one input
 * pin can have edges that omit `targetHandle` entirely (several existing fixtures and
 * hand-authored flows rely on this — unambiguous only because there's nothing else the
 * single pin could mean). Every Phase 7+ multi-input-pin node (operators, Branch, Switch)
 * always has an explicit handle on each of its edges, so this fallback never applies to them.
 */
function isExecPredecessorEdge(edge: FlowEdge, targetNode: FlowNode): boolean {
  const def = requireNodeDefinition(targetNode.type);
  const execPort = execEntryPort(def);
  if (!execPort) return false;
  if (edge.targetHandle === execPort.id) return true;
  return edge.targetHandle === undefined && def.inputs.length === 1;
}

interface HoistResult {
  statements: string[];
  /** True if any node hoisted by this call (directly or via recursion) declares `requiresAsync: true`. */
  requiresAsync: boolean;
  /**
   * Every `EmittedCode.imports` entry contributed by a node hoisted by this call (directly or
   * via recursion) — these are file-level `require()` lines, always safe to bubble all the way
   * up to the generated file's top-of-file import list regardless of how deep in a handler
   * chain or value-dependency graph they were discovered (unlike `.setup`/`.body`, which may
   * reference per-request wiring and can't be hoisted past their own scope).
   */
  imports: string[];
}

/**
 * Hoists this node's pure-value dependencies — walking every incoming edge except the
 * execution-flow "in" pin — emitting each not-yet-emitted producer's statement (recursing
 * into ITS dependencies first) before returning. `emitted` accumulates every node id whose
 * statement has already been pushed into the current scope, whether reached by direct exec
 * traversal or by a prior hoist — a single shared "already emitted here" set, not two
 * separate ones, is what lets this function recognize "this value's producer already ran
 * earlier on the exec spine" and skip re-emitting it (as opposed to only recognizing
 * "already hoisted as a value," which would let an exec-spine node's statement be duplicated
 * the first time something reads its result).
 *
 * Also reports whether any hoisted producer's `NodeDefinition.requiresAsync` is `true`, so
 * callers can bubble that up into the enclosing block's async requirement, and collects every
 * hoisted producer's declared `imports` (see `HoistResult.imports`).
 */
function hoistValueDepsCore(nodeId: string, ctx: EmitContext, emitted: Set<string>): HoistResult {
  const statements: string[] = [];
  const imports: string[] = [];
  let requiresAsync = false;
  const node = ctx.getNode(nodeId);
  if (!node) return { statements, requiresAsync, imports };

  for (const edge of ctx.getIncoming(nodeId)) {
    if (isExecPredecessorEdge(edge, node)) continue;
    const sourceId = edge.source;
    if (emitted.has(sourceId)) continue;

    const sub = hoistValueDepsCore(sourceId, ctx, emitted);
    statements.push(...sub.statements);
    imports.push(...sub.imports);
    if (sub.requiresAsync) requiresAsync = true;
    if (emitted.has(sourceId)) continue; // a sibling edge's recursive hoist may have just emitted it

    const sourceNode = ctx.getNode(sourceId);
    if (sourceNode && requireNodeDefinition(sourceNode.type).requiresAsync === true) {
      requiresAsync = true;
    }

    const emittedCode = ctx.emitNode(sourceId);
    if (emittedCode.body) statements.push(emittedCode.body);
    if (emittedCode.imports) imports.push(...emittedCode.imports);
    emitted.add(sourceId);
  }

  return { statements, requiresAsync, imports };
}

/** Exported for `emit-function-graph.ts`, which needs the fuller result (imports, requiresAsync)
 * in addition to the hoisted statements themselves — unlike `route.node.ts`, which only ever
 * consumes hoisted statements via the block-level result below. */
export { hoistValueDepsCore };

interface EmitBlockResult {
  code: string;
  /** Every node id whose statement was emitted in this scope (or an ancestor scope it forked from). */
  emitted: Set<string>;
  /**
   * True if any node emitted in this block (directly, via a hoisted value dependency, or in
   * either arm of a nested Branch/Switch fork) declares `NodeDefinition.requiresAsync: true`.
   * Callers (e.g. `route.node.ts`) use this to require the enclosing handler be declared async.
   */
  requiresAsync: boolean;
  /**
   * Every `EmittedCode.imports` entry contributed by any node emitted in this block — see
   * `HoistResult.imports`. Callers must merge this into their own returned `EmittedCode.imports`
   * (deduping happens for free at the top-level `emit-express.ts` assembly, which already
   * collects all `imports` into a `Set`). Found via real browser verification: a plugin node
   * placed inside a Route's handler chain had its declared `require()` line silently dropped —
   * `emitBlock`/`hoistValueDepsCore` previously only ever read `.body` off a nested node's
   * `EmittedCode`, and `emit-express.ts`'s own import collection only walks top-level structural
   * nodes, never handler-chain-nested ones — so a chain-nested node's imports had nowhere to go.
   */
  imports: string[];
}

function emitBlock(startNodeId: string | undefined, ctx: EmitContext, inherited: ReadonlySet<string>): EmitBlockResult {
  const emitted = new Set(inherited); // copy: a fork's sibling arms never see each other's emissions
  const statements: string[] = [];
  const imports: string[] = [];
  let requiresAsync = false;
  let currentId = startNodeId;

  while (currentId) {
    if (emitted.has(currentId)) {
      throw new Error(`Cycle detected in exec chain at node "${currentId}"`);
    }
    const node = ctx.getNode(currentId);
    if (!node) {
      throw new Error(`emitExecChain: unknown node id "${currentId}"`);
    }

    const hoisted = hoistValueDepsCore(currentId, ctx, emitted);
    statements.push(...hoisted.statements);
    imports.push(...hoisted.imports);
    if (hoisted.requiresAsync) requiresAsync = true;
    if (requireNodeDefinition(node.type).requiresAsync === true) requiresAsync = true;
    emitted.add(currentId);

    const armPinIds = getForkArmPinIds(node);
    if (armPinIds) {
      const arms: ForkArm[] = armPinIds.map((pinId) => {
        const edge = ctx.getOutgoing(currentId!, pinId)[0];
        if (!edge) return { pinId, code: "", wired: false };
        const sub = emitBlock(edge.target, ctx, emitted);
        if (sub.requiresAsync) requiresAsync = true;
        imports.push(...sub.imports);
        return { pinId, code: sub.code, wired: true };
      });
      if (!arms.some((a) => a.wired)) {
        throw new Error(`Node "${currentId}" has no outgoing connections on any of its branch/case outputs`);
      }

      const assembled =
        node.type === "controlFlow.branch"
          ? assembleIfElse(resolveValuePin(node, ctx, "condition", { defaultLiteral: "false" }), arms)
          : node.type === "controlFlow.switch"
            ? assembleSwitchStatement(resolveValuePin(node, ctx, "selection", { defaultLiteral: "0" }), getSwitchCases(node), arms)
            : assembleSequence(arms); // controlFlow.sequence
      statements.push(assembled);
      return { code: statements.join("\n"), emitted, requiresAsync, imports }; // fork nodes are always block-terminal
    }

    const emittedCode = ctx.emitNode(currentId);
    if (emittedCode.body) statements.push(emittedCode.body);
    if (emittedCode.imports) imports.push(...emittedCode.imports);
    currentId = ctx.getOutgoing(currentId, "out")[0]?.target;
  }

  return { code: statements.join("\n"), emitted, requiresAsync, imports };
}

/**
 * Walks an execution chain starting at `startNodeId`, hoisting pure-value dependencies as
 * they're needed and recursively compiling Branch/Switch into real `if`/`else`/`switch`
 * blocks. Replaces the old flat "follow `out` edges" walk that `route.node.ts` and
 * `emit-function-graph.ts` each used to have — both now call this shared implementation.
 */
export function emitExecChain(startNodeId: string | undefined, ctx: EmitContext): EmitBlockResult {
  return emitBlock(startNodeId, ctx, new Set());
}
