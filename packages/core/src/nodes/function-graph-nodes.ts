import type { NodeDefinition } from "../schema/node-registry.js";
import { logicGraphEntryNode } from "./logic/graph-entry.node.js";
import { logicGraphReturnNode } from "./logic/graph-return.node.js";
import { logicFunctionCallNode } from "./logic/function-call.node.js";
import { consoleLogNode } from "./debug/console-log.node.js";
import { customCodeNode } from "./handler/custom-code.node.js";
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

/**
 * Node types offered inside a Function node's blueprint body sub-canvas — deliberately kept
 * separate from `BUILTIN_NODES`/the main registry list used by `NodeBrowserModal`/
 * `NodePickerMenu`, so top-level-only types (express.*, middleware.*, express.route,
 * handler.sendJson, logic.function/export/require — all app-wiring or file-level
 * declarations, not body statements) never show up as addable inside a function body.
 * `consoleLogNode`/`customCodeNode` are also valid on the main canvas's handler chains, but
 * their emitted bodies are just a statement (`console.log(...)`, raw code respectively) with
 * no hard dependency on Express's `req`/`res` being in scope, so they double as generic
 * escape-hatch statements inside a blueprint graph too — `FunctionGraphNodePicker.tsx` offers
 * every type here generically except `logicGraphEntryNode`/`logicGraphReturnNode` (managed
 * exclusively via the Details panel's Inputs/Outputs sections) and `logicFunctionCallNode`
 * (only ever added pre-filled from a resolved Require'd function, never blank).
 * `variableGetNode`/`variableSetNode` are excluded from the picker for the same reason as
 * `logicFunctionCallNode` — they need a bound `data.variableId`, only ever set by dragging a
 * row out of the Details panel's Variables section — but still need to be listed here so
 * `GenericNode` can resolve their ports when rendering an already-placed instance. All types
 * here are still registered in the shared node-registry (via `registerBuiltinNodes()`), since
 * `emit-function-graph.ts` resolves them by type through the normal
 * `requireNodeDefinition()` lookup — this list only controls what editor-ui *offers* to add.
 */
export const FUNCTION_GRAPH_NODE_DEFINITIONS: NodeDefinition[] = [
  logicGraphEntryNode,
  logicGraphReturnNode,
  logicFunctionCallNode,
  variableGetNode,
  variableSetNode,
  consoleLogNode,
  customCodeNode,
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
];

/**
 * Types that only ever make sense inside a function's blueprint sub-canvas. Unlike
 * `logic.functionCall` (usable both at the top level and inside a blueprint graph), these
 * must never appear in the top-level "add node" surfaces — `editor-server`'s
 * `/api/node-registry` route filters them out of its default (unscoped) response using this set.
 */
export const FUNCTION_GRAPH_ONLY_TYPES: ReadonlySet<string> = new Set([
  logicGraphEntryNode.type,
  logicGraphReturnNode.type,
]);
