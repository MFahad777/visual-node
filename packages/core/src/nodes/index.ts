import { getNodeDefinition, registerNode } from "../schema/node-registry.js";
import { expressInitNode } from "./server/express-init.node.js";
import { expressListenNode } from "./server/listen.node.js";
import { jsonBodyParserNode } from "./middleware/json-body-parser.node.js";
import { customMiddlewareNode } from "./middleware/custom-code.node.js";
import { routeNode } from "./routing/route.node.js";
import { sendJsonNode } from "./handler/send-json.node.js";
import { customCodeNode } from "./handler/custom-code.node.js";
import { logicFunctionNode } from "./logic/function.node.js";
import { logicExportNode } from "./logic/export.node.js";
import { logicRequireNode } from "./logic/require.node.js";
import { logicFunctionCallNode } from "./logic/function-call.node.js";
import { consoleLogNode } from "./debug/console-log.node.js";
import { logicGraphEntryNode } from "./logic/graph-entry.node.js";
import { logicGraphReturnNode } from "./logic/graph-return.node.js";
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
import { beginNode } from "./logic/begin.node.js";
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

const BUILTIN_NODES = [
  expressInitNode,
  expressListenNode,
  jsonBodyParserNode,
  customMiddlewareNode,
  routeNode,
  sendJsonNode,
  customCodeNode,
  logicFunctionNode,
  logicExportNode,
  logicRequireNode,
  logicFunctionCallNode,
  consoleLogNode,
  // Function-graph-only node types (see nodes/function-graph-nodes.ts) — registered here so
  // requireNodeDefinition() can resolve them during codegen, but deliberately absent from
  // any "add node" UI surface for the top-level canvas.
  logicGraphEntryNode,
  logicGraphReturnNode,
  // Phase 7: operators (pure value nodes) and control-flow (Branch/Switch) — usable on both
  // the main canvas and inside Function Graphs (see FUNCTION_GRAPH_NODE_DEFINITIONS below).
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
  // Phase 10: variables (module-scope on the main canvas, function-scope inside a Function's
  // blueprint graph — see docs/phase10-variables-plan.md).
  variableGetNode,
  variableSetNode,
  // Phase 11: Begin — per-file entry point, runs once at module load. Available on the main
  // canvas of any .blueprint file; deliberately absent from FUNCTION_GRAPH_NODE_DEFINITIONS
  // below since a Function's nested blueprint graph already has its own entry concept
  // (logic.graphEntry) — see docs/phase11-begin-node-plan.md.
  beginNode,
  // Phase 17: array operation nodes — usable on both the main canvas and inside Function
  // Graphs (see FUNCTION_GRAPH_NODE_DEFINITIONS below), same "full parity" treatment as
  // operators/control-flow.
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
  // Phase 18: Path Extractor — resolves a lodash-syntax property path against an object,
  // usable on both the main canvas and inside Function Graphs (see
  // FUNCTION_GRAPH_NODE_DEFINITIONS below), same "full parity" treatment as operators/arrays.
  pathExtractorNode,
  // Phase 20: Callback — invokes a wired function-value reference with dynamically-added
  // argument pins, usable on both the main canvas and inside Function Graphs (see
  // FUNCTION_GRAPH_NODE_DEFINITIONS below).
  callbackNode,
];

/** Registers all built-in MVP node definitions. Safe to call more than once (e.g. after clearRegistry()). */
export function registerBuiltinNodes(): void {
  for (const def of BUILTIN_NODES) {
    if (!getNodeDefinition(def.type)) registerNode(def);
  }
}

export {
  expressInitNode,
  expressListenNode,
  jsonBodyParserNode,
  customMiddlewareNode,
  routeNode,
  sendJsonNode,
  customCodeNode,
  logicFunctionNode,
  logicExportNode,
  logicRequireNode,
  logicFunctionCallNode,
  consoleLogNode,
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
  variableGetNode,
  variableSetNode,
  beginNode,
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
  pathExtractorNode,
  callbackNode,
};
