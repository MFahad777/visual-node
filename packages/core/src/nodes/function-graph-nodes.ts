import type { NodeDefinition } from "../schema/node-registry.js";
import { logicGraphEntryNode } from "./logic/graph-entry.node.js";
import { logicGraphReturnNode } from "./logic/graph-return.node.js";
import { logicFunctionCallNode } from "./logic/function-call.node.js";
import { consoleLogNode } from "./debug/console-log.node.js";
import { sendJsonNode } from "./handler/send-json.node.js";
import { addNode } from "./operators/add.node.js";
import { subtractNode } from "./operators/subtract.node.js";
import { multiplyNode } from "./operators/multiply.node.js";
import { divideNode } from "./operators/divide.node.js";
import { moduloNode } from "./operators/modulo.node.js";
import { equalNode } from "./operators/equal.node.js";
import { notEqualNode } from "./operators/not-equal.node.js";
import { greaterThanNode } from "./operators/greater-than.node.js";
import { lessThanNode } from "./operators/less-than.node.js";
import { greaterOrEqualNode } from "./operators/greater-or-equal.node.js";
import { lessOrEqualNode } from "./operators/less-or-equal.node.js";
import { andNode } from "./operators/and.node.js";
import { nandNode } from "./operators/nand.node.js";
import { orNode } from "./operators/or.node.js";
import { norNode } from "./operators/nor.node.js";
import { xorNode } from "./operators/xor.node.js";
import { notNode } from "./operators/not.node.js";
import { controlFlowBranchNode } from "./control-flow/branch.node.js";
import { controlFlowSwitchNode } from "./control-flow/switch.node.js";
import { controlFlowSequenceNode } from "./control-flow/sequence.node.js";
import { variableGetNode } from "./logic/variable-get.node.js";
import { variableSetNode } from "./logic/variable-set.node.js";
import { arrayMapNode } from "./array/map.node.js";
import { arrayFilterNode } from "./array/filter.node.js";
import { arrayForEachNode } from "./array/for-each.node.js";
import { arrayFlatMapNode } from "./array/flat-map.node.js";
import { arrayFindNode } from "./array/find.node.js";
import { arrayFindIndexNode } from "./array/find-index.node.js";
import { arrayEveryNode } from "./array/every.node.js";
import { arraySomeNode } from "./array/some.node.js";
import { arrayReduceNode } from "./array/reduce.node.js";
import { arrayPushNode } from "./array/push.node.js";
import { arrayPopNode } from "./array/pop.node.js";
import { arrayUnshiftNode } from "./array/unshift.node.js";
import { arrayShiftNode } from "./array/shift.node.js";
import { arrayIncludesNode } from "./array/includes.node.js";
import { arrayIndexOfNode } from "./array/index-of.node.js";
import { pathExtractorNode } from "./logic/path-extractor.node.js";
import { callbackNode } from "./logic/callback.node.js";
import { tryCatchNode } from "./error/try-catch.node.js";
import { throwNode } from "./error/throw.node.js";
import logicPromiseNode from "./logic/promise.node.js";

/**
 * Node types offered inside a Function or Handler Function node's blueprint body sub-canvas — deliberately kept
 * separate from `BUILTIN_NODES`/the main registry list used by `NodeBrowserModal`/
 * `NodePickerMenu`, so top-level-only types (express.*, middleware.*, express.route,
 * logic.function/logic.handlerFunction/export/require — all app-wiring or file-level
 * declarations, not body statements) never show up as addable inside a function body.
 * `consoleLogNode`/`sendJsonNode` are valid inside both `logic.function` and `logic.handlerFunction`
 * blueprint graphs (sendJsonNode specifically emits `res.json(...)`, making it useful in handler
 * bodies where a `res` identifier is in scope). Their emitted bodies are just a statement
 * (`console.log(...)`, response-sending code respectively) with no hard dependency on Express's
 * req/res beyond what the specific node declares, so they work as both top-level-wiring and
 * generic-statement escape-hatches — `FunctionGraphNodePicker.tsx` offers every type here
 * generically except `logicGraphEntryNode`/`logicGraphReturnNode` (managed exclusively via the
 * Details panel's Inputs/Outputs sections) and `logicFunctionCallNode` (only ever added
 * pre-filled from a resolved Require'd function, never blank). `variableGetNode`/`variableSetNode`
 * are excluded from the picker for the same reason as `logicFunctionCallNode` — they need a bound
 * `data.variableId`, only ever set by dragging a row out of the Details panel's Variables section
 * — but still need to be listed here so `GenericNode` can resolve their ports when rendering an
 * already-placed instance. All types here are still registered in the shared node-registry (via
 * `registerBuiltinNodes()`), since `emit-function-graph.ts` resolves them by type through the
 * normal `requireNodeDefinition()` lookup — this list only controls what editor-ui *offers* to add.
 */
export const FUNCTION_GRAPH_NODE_DEFINITIONS: NodeDefinition[] = [
  logicGraphEntryNode,
  logicGraphReturnNode,
  logicFunctionCallNode,
  variableGetNode,
  variableSetNode,
  consoleLogNode,
  // Phase 24: sendJsonNode is now the way to respond with JSON inside a Handler Function's
  // blueprint graph (replaces the deleted custom-code escape hatch for handlers).
  sendJsonNode,
  // Phase 7: operators and control-flow (Branch/Switch) are full main-canvas/Function-Graph
  // parity types, not function-graph-only — computing a value or branching inside a
  // function's body is as ordinary as doing either at the top level.
  addNode,
  subtractNode,
  multiplyNode,
  divideNode,
  moduloNode,
  equalNode,
  notEqualNode,
  greaterThanNode,
  lessThanNode,
  greaterOrEqualNode,
  lessOrEqualNode,
  andNode,
  nandNode,
  orNode,
  norNode,
  xorNode,
  notNode,
  controlFlowBranchNode,
  controlFlowSwitchNode,
  controlFlowSequenceNode,
  // Phase 37: full main-canvas/Function-Graph parity, same reasoning as operators/array/
  // control-flow above.
  tryCatchNode,
  throwNode,
  // Phase 17: array operation nodes — ordinary statement-producing nodes with no req/res
  // dependency, same "full main-canvas/Function-Graph parity" reasoning as operators/
  // control-flow above.
  arrayMapNode,
  arrayFilterNode,
  arrayForEachNode,
  arrayFlatMapNode,
  arrayFindNode,
  arrayFindIndexNode,
  arrayEveryNode,
  arraySomeNode,
  arrayReduceNode,
  arrayPushNode,
  arrayPopNode,
  arrayUnshiftNode,
  arrayShiftNode,
  arrayIncludesNode,
  arrayIndexOfNode,
  // Phase 18: Path Extractor — ordinary statement-producing node with no req/res dependency,
  // same "full main-canvas/Function-Graph parity" reasoning as operators/array nodes above.
  pathExtractorNode,
  // Phase 20: Callback — ordinary statement-producing node with no req/res dependency, same
  // "full main-canvas/Function-Graph parity" reasoning as operators/array/Path Extractor above.
  callbackNode,
  // Phase 36: Promise — construct and handle promises with optional await, then/catch arms,
  // or variable binding. Full main-canvas/Function-Graph parity; also usable recursively
  // inside another Promise's own executor blueprint body.
  logicPromiseNode,
];

/**
 * Types that only ever make sense inside a function's blueprint sub-canvas. Unlike
 * `logic.functionCall` (usable both at the top level and inside a blueprint graph), these
 * must never appear in the top-level "add node" surfaces — `editor-server`'s
 * `/api/node-registry` route filters them out of its default (unscoped) response using this
 * set.
 *
 * `logicGraphReturnNode` is deliberately NOT in this set (unlike before array loop-body
 * wiring existed): it's now a legitimate main-canvas node, wired inside a loop node's
 * "Loop Body" arm to produce that iteration's `.map()`/`.filter()`/etc. return value —
 * `exec-chain.ts`'s loop dispatch recurses into a wired body with the exact same `emitBlock`
 * Branch/Switch arms use, so Return already works there with zero extra codegen. Only Entry
 * stays function-graph-only: a Route has no "parameters" concept for it to expose.
 */
export const FUNCTION_GRAPH_ONLY_TYPES: ReadonlySet<string> = new Set([logicGraphEntryNode.type]);
