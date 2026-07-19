import type { FlowEdge, FlowNode } from "../schema/node.types.js";
import { requireNodeDefinition, type EmitContext, type LoopShape, type NodeDefinition, type PortDefinition } from "../schema/node-registry.js";
import { resolveValuePin } from "./value-pins.js";
import { commentBlockFor } from "./node-comment.js";

/**
 * Deliberately duplicated from `emit-function-graph.ts`'s identical helper rather than
 * imported — that module imports `emitExecChain`/`hoistValueDepsCore` FROM this file, so a
 * reverse import here would be circular. Same rationale `validate.ts`'s
 * `isExecPredecessorEdge` duplication already documents.
 */
function sanitizeIdentifier(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/**
 * The `resolve`/`reject` identifiers used for a `logic.promise` node's own executor, unique
 * per node instance. Only used for **blueprint-mode** promises — code-mode executor bodies are
 * raw text the user hand-typed assuming the literal parameter names "resolve"/"reject" (per the
 * node's own config-panel hint), so those keep the bare literals unchanged.
 *
 * Blueprint mode needs uniqueness because a `logic.promise` node can itself contain another
 * `logic.promise` node inside its executor's blueprint graph (its Then/Catch arm is compiled
 * with the SAME `ctx`/ScopeGraph as the outer executor — see the `logic.promise` branch below).
 * If every executor's arrow function used the bare literals "resolve"/"reject", the inner
 * node's own `(resolve, reject) => {...}` parameters would lexically shadow the outer
 * executor's identically-named parameters — silently breaking any inner arm that wires to the
 * OUTER graph-entry's "resolve"/"reject" pin intending to settle the OUTER Promise instead of
 * the inner one. `promise.node.ts`'s `promiseExecutor` passes this same pair into
 * `emitFunctionGraphBody` so `logic.graphEntry`'s `resultIdentifier` hands back these exact
 * names instead of the bare handle strings.
 */
export function promiseExecutorParamNames(nodeId: string): { resolve: string; reject: string } {
  const suffix = sanitizeIdentifier(nodeId);
  return { resolve: `resolve_${suffix}`, reject: `reject_${suffix}` };
}

/**
 * The error identifier used inside an `error.tryCatch` node's catch block — unique per node
 * instance so nested try-catch blocks never shadow each other's error variables.
 */
export function tryCatchErrorIdentifier(nodeId: string): string {
  return `err_${sanitizeIdentifier(nodeId)}`;
}

/**
 * The enclosing-promise-scope chain a nested `logic.promise` node's OWN blueprint executor
 * graph should inherit from `ctx`, the context the outer `logic.promise` node is itself being
 * emitted under. If `ctx` is itself a `logic.promise` executor scope (`ctx.promiseExecutorParams`
 * set), that becomes the new nearest enclosing level, with whatever already enclosed `ctx`
 * pushed one level further out; otherwise `ctx`'s own enclosing chain (if any, from further out
 * still) passes straight through unchanged. Only ever called from `promise.node.ts`'s
 * `promiseExecutor` — a `logic.promise` can only ever nest inside another `logic.promise`
 * (`logic.function`/`logic.handlerFunction` are never addable inside a blueprint sub-canvas at
 * all, so there's no intervening scope to pass this through for).
 */
export function mergeEnclosingPromiseParams(ctx: EmitContext): Array<{ resolve: string; reject: string }> | undefined {
  if (ctx.promiseExecutorParams) {
    return [ctx.promiseExecutorParams, ...(ctx.enclosingPromiseExecutorParams ?? [])];
  }
  return ctx.enclosingPromiseExecutorParams;
}

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
  if (node.type === "error.tryCatch") {
    const hasFinally = (node.data as Record<string, unknown> | undefined)?.hasFinally === true;
    return hasFinally ? ["try", "catch", "finally"] : ["try", "catch"];
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
 * every wired arm fires, unconditionally, in pin order. Arms are emitted directly without
 * wrapping, separated by a blank line so each pin's statements are visually distinct in the
 * generated output. There is no conditional guarding any of them. An unwired pin contributes
 * nothing (same "unwired = does nothing" convention as Branch's unwired False / Switch's
 * unwired case).
 */
function assembleSequence(arms: ForkArm[]): string {
  return arms
    .filter((a) => a.wired)
    .map((a) => a.code)
    .join("\n\n");
}

/**
 * Assembles a try-catch or try-catch-finally block: tries the Try arm's code, and if an
 * exception is thrown, catches it with the given error identifier and runs the Catch arm's code.
 * Optionally appends a Finally arm if one is present and wired (runs unconditionally after
 * Try/Catch, whether or not an error was thrown). Unlike a Branch (which picks one of two paths
 * conditionally), Try/Catch have a clear semantic: Try always runs first; Catch only runs if
 * Try throws; Finally (if present and wired) always runs.
 */
function assembleTryCatch(arms: ForkArm[], errorIdentifier: string): string {
  const tryArm = arms.find((a) => a.pinId === "try")!;
  const catchArm = arms.find((a) => a.pinId === "catch")!;
  const finallyArm = arms.find((a) => a.pinId === "finally");
  const head = `try {\n${indent(tryArm.code)}\n} catch (${errorIdentifier}) {\n${indent(catchArm.code)}\n}`;
  if (finallyArm?.wired) {
    return `${head} finally {\n${indent(finallyArm.code)}\n}`;
  }
  return head;
}

/**
 * Assembles the real `.map()`/`.filter()`/`.reduce()`/etc. call for a loop node whose
 * `bodyPin` is actually wired — `bodyCode` is the already-compiled nested scope (see the
 * `loop` branch in `emitBlock` below). Callback parameters use per-node-unique identifiers
 * (`_item_<id>`/`_index_<id>`/`_array_<id>`, plus `_acc_<id>` for reduce) rather than bare
 * `item`/`index`/`array` so a loop wired inside another loop's body never shadows its
 * parent's context variables — `resultIdentifierFor` resolves a downstream read of this
 * node's `element`/`index`/`arrayRef`/`accumulator` pin to these exact same names (see
 * `array-loop.factory.ts`/`reduce.node.ts`'s handle-aware `resultIdentifier`). The node's own
 * JS method name is derived from `node.type` (`"array.map"` -&gt; `"map"`) rather than stored
 * separately, since every loop-container type is literally `"array.&lt;method&gt;"`.
 */
function assembleWiredLoopCall(node: FlowNode, ctx: EmitContext, loop: LoopShape, def: NodeDefinition, bodyCode: string): string {
  const id = sanitizeIdentifier(node.id);
  const method = node.type.slice("array.".length);
  const arrayExpr = resolveValuePin(node, ctx, "array", { defaultLiteral: "[]" });
  const isReduce = loop.contextPinIds.includes("accumulator");
  const producesResult = def.outputs.some((p) => p.id === "result");

  const params = isReduce ? [`_acc_${id}`, `_item_${id}`, `_index_${id}`, `_array_${id}`] : [`_item_${id}`, `_index_${id}`, `_array_${id}`];
  const initialValueSuffix = isReduce ? `, ${String((node.data as Record<string, unknown> | undefined)?.initialValue ?? "0")}` : "";
  const call = `${arrayExpr}.${method}((${params.join(", ")}) => {\n${bodyCode}\n}${initialValueSuffix})`;

  return producesResult ? `const _arr_${id} = ${call};` : `${call};`;
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
    if (sourceNode) {
      const ra = requireNodeDefinition(sourceNode.type).requiresAsync;
      if (typeof ra === "function" ? ra(sourceNode) : ra === true) {
        requiresAsync = true;
      }
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
  /**
   * True if any `logic.promise` node emitted in this block (directly, or in a nested fork/loop
   * arm) is awaited AND has its own `data.wrapInIife === false` — a per-instance opt-out from
   * `logic.begin`'s default fire-and-forget `(async () => { ... })();` wrapper. Only
   * `logic.begin` ever reads this (it's the only exec-chain owner with no async-capable
   * function scope of its own to bubble `requiresAsync` into — Route/Function/Handler Function
   * each have their own "Async" checkbox instead, so a wrapper never applies there regardless
   * of this flag). Ignored (and irrelevant) when `requiresAsync` is false.
   */
  suppressIifeWrap: boolean;
}

function emitBlock(startNodeId: string | undefined, ctx: EmitContext, inherited: ReadonlySet<string>): EmitBlockResult {
  const emitted = new Set(inherited); // copy: a fork's sibling arms never see each other's emissions
  const statements: string[] = [];
  const imports: string[] = [];
  let requiresAsync = false;
  let suppressIifeWrap = false;
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
    const ra = requireNodeDefinition(node.type).requiresAsync;
    if (typeof ra === "function" ? ra(node) : ra === true) {
      requiresAsync = true;
    }
    emitted.add(currentId);

    if (node.type === "logic.promise") {
      const def = requireNodeDefinition(node.type);
      const data = node.data as Record<string, unknown> | undefined;
      const awaited = data?.awaited === true;
      const isBlueprint = data?.mode === "blueprint";

      const executor = def.promiseExecutor!(node, ctx);
      imports.push(...executor.imports);
      // If the executor body itself needs `await` (e.g. a nested awaited Promise), the
      // executor function is declared `async` — same as a hand-written
      // `new Promise(async (resolve, reject) => { await ... })`. Note: an error thrown
      // after an `await` in here that isn't manually caught and passed to `reject()`
      // becomes an unhandled rejection instead of rejecting this Promise, since the
      // Promise constructor discards whatever the async executor function returns — a
      // known JS gotcha (ESLint's `no-async-promise-executor`), deliberately not papered
      // over with an auto-generated try/catch; the user is expected to call `reject()`
      // explicitly on any error path they care about.
      const executorPrefix = executor.requiresAsync ? "async " : "";
      // Blueprint-mode executors use per-instance-unique parameter names (see
      // `promiseExecutorParamNames`) so a `logic.promise` node nested inside another
      // blueprint-mode Promise's own executor graph never lexically shadows the outer
      // executor's "resolve"/"reject". Code-mode executors keep the bare literals — that
      // body is raw text the user hand-typed assuming those exact names.
      const { resolve: resolveParam, reject: rejectParam } = isBlueprint
        ? promiseExecutorParamNames(currentId)
        : { resolve: "resolve", reject: "reject" };
      let expr = `new Promise(${executorPrefix}(${resolveParam}, ${rejectParam}) => {\n${indent(executor.code)}\n})`;

      if (awaited) {
        expr = `await ${expr}`;
        requiresAsync = true; // bubbles normally — this DOES need the enclosing scope async
        if ((node.data as Record<string, unknown> | undefined)?.wrapInIife === false) {
          suppressIifeWrap = true;
        }
      } else {
        const thenEdge = ctx.getOutgoing(currentId, "then")[0];
        if (thenEdge) {
          const sub = emitBlock(thenEdge.target, ctx, emitted);
          if (sub.requiresAsync) {
            throw new Error(`Promise node "${currentId}"'s Then arm requires "await" support ` +
              `the Then callback does not have — restructure to avoid needing await here.`);
          }
          imports.push(...sub.imports);
          expr += `\n  .then((value) => {\n${indent(sub.code)}\n  })`;
          // NOTE: sub.requiresAsync is deliberately NOT bubbled into the outer `requiresAsync`
          // — Then is a real new function boundary, unlike Branch/Switch/Sequence arms which
          // are plain `{}` blocks in the same function scope.
        }
        const catchEdge = ctx.getOutgoing(currentId, "catch")[0];
        if (catchEdge) {
          const sub = emitBlock(catchEdge.target, ctx, emitted);
          if (sub.requiresAsync) {
            throw new Error(`Promise node "${currentId}"'s Catch arm requires "await" support ` +
              `the Catch callback does not have — restructure to avoid needing await here.`);
          }
          imports.push(...sub.imports);
          expr += `\n  .catch((error) => {\n${indent(sub.code)}\n  })`;
        }
      }

      const assignEdge = ctx.getOutgoing(currentId, "assign")[0];
      let nextId: string | undefined;
      if (assignEdge) {
        const setNode = ctx.getNode(assignEdge.target);
        if (!setNode || setNode.type !== "variable.set") {
          throw new Error(`Promise node "${currentId}"'s Assign pin must be wired to a Set Variable node.`);
        }
        const outEdge = ctx.getOutgoing(currentId, "out")[0];
        if (!outEdge || outEdge.target !== setNode.id) {
          throw new Error(`Promise node "${currentId}"'s Assign pin target must be the node ` +
            `immediately following it on the "Out" pin.`);
        }
        const variable = (ctx.flow.variables ?? []).find(
          (v) => v.id === (setNode.data as Record<string, unknown> | undefined)?.variableId
        );
        if (!variable) {
          throw new Error(`Set Variable node "${setNode.id}" references an unknown variable.`);
        }
        const stmt = variable.keyword === "const" ? `const ${variable.name} = ${expr};` : `${variable.name} = ${expr};`;
        const commentBlock = commentBlockFor(node);
        statements.push(commentBlock ? `${commentBlock}\n${stmt}` : stmt);
        emitted.add(setNode.id); // absorbed — never independently processed
        nextId = ctx.getOutgoing(setNode.id, "out")[0]?.target;
      } else {
        const commentBlock = commentBlockFor(node);
        statements.push(commentBlock ? `${commentBlock}\n${expr};` : `${expr};`);
        nextId = ctx.getOutgoing(currentId, "out")[0]?.target;
      }

      currentId = nextId;
      continue;
    }

    const armPinIds = getForkArmPinIds(node);
    if (armPinIds) {
      const arms: ForkArm[] = armPinIds.map((pinId) => {
        const edge = ctx.getOutgoing(currentId!, pinId)[0];
        if (!edge) return { pinId, code: "", wired: false };
        const sub = emitBlock(edge.target, ctx, emitted);
        if (sub.requiresAsync) requiresAsync = true;
        if (sub.suppressIifeWrap) suppressIifeWrap = true;
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
            : node.type === "error.tryCatch"
              ? assembleTryCatch(arms, tryCatchErrorIdentifier(node.id))
              : assembleSequence(arms); // controlFlow.sequence
      const commentBlock = commentBlockFor(node);
      statements.push(commentBlock ? `${commentBlock}\n${assembled}` : assembled);
      return { code: statements.join("\n"), emitted, requiresAsync, suppressIifeWrap, imports }; // fork nodes are always block-terminal
    }

    const def = requireNodeDefinition(node.type);
    const loop = def.loopShape;
    if (loop) {
      const bodyEdge = ctx.getOutgoing(currentId, loop.bodyPin)[0];
      if (bodyEdge) {
        // Wired loop body: compile it as a nested scope (same "fresh emitted copy" isolation
        // as a fork arm) and assemble the real `.map()`/`.filter()`/etc. call around it,
        // ignoring the node's own unwired-fallback `emit()` (raw callback-text mode) entirely.
        const sub = emitBlock(bodyEdge.target, ctx, emitted);
        if (sub.requiresAsync) requiresAsync = true;
        if (sub.suppressIifeWrap) suppressIifeWrap = true;
        imports.push(...sub.imports);
        statements.push(assembleWiredLoopCall(node, ctx, loop, def, sub.code));
      } else {
        // Unwired: fall back to the node's own callback-text `emit()`, unchanged from before
        // loop-body wiring existed — every pre-existing flow keeps compiling byte-identically.
        const emittedCode = ctx.emitNode(currentId);
        if (emittedCode.body) statements.push(emittedCode.body);
        if (emittedCode.imports) imports.push(...emittedCode.imports);
      }
      // Unlike a fork's arms, `completedPin` continues in THIS SAME scope (not block-terminal)
      // — the assembled statement above sits in the enclosing block just like any other
      // statement, so the trunk walk simply resumes from here.
      currentId = ctx.getOutgoing(currentId, loop.completedPin)[0]?.target;
      continue;
    }

    const emittedCode = ctx.emitNode(currentId);
    if (emittedCode.body) statements.push(emittedCode.body);
    if (emittedCode.imports) imports.push(...emittedCode.imports);
    currentId = ctx.getOutgoing(currentId, "out")[0]?.target;
  }

  return { code: statements.join("\n"), emitted, requiresAsync, suppressIifeWrap, imports };
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
