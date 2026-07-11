import type { NodeTypes } from "@xyflow/react";
import { ServerNode } from "../components/nodes/ServerNode.js";
import { MiddlewareNode } from "../components/nodes/MiddlewareNode.js";
import { RouteNode } from "../components/nodes/RouteNode.js";
import { HandlerNode } from "../components/nodes/HandlerNode.js";
import { LogicNode } from "../components/nodes/LogicNode.js";
import { DebugNode } from "../components/nodes/DebugNode.js";
import { OperatorNode } from "../components/nodes/OperatorNode.js";
import { ControlFlowNode } from "../components/nodes/ControlFlowNode.js";
import { CommentGroupNode } from "./CommentGroupNode.js";
import { GenericNode } from "./GenericNode.js";

const explicitNodeTypes: NodeTypes = {
  "express.init": ServerNode,
  "express.listen": ServerNode,
  "express.middleware.jsonParser": MiddlewareNode,
  "middleware.customCode": MiddlewareNode,
  "express.route": RouteNode,
  "handler.sendJson": HandlerNode,
  "logic.function": LogicNode,
  "logic.handlerFunction": LogicNode,
  "logic.export": LogicNode,
  "logic.require": LogicNode,
  "logic.functionCall": LogicNode,
  "logic.graphEntry": LogicNode,
  "logic.graphReturn": LogicNode,
  "debug.consoleLog": DebugNode,
  // Phase 7: pure value operator nodes (no execution pins).
  "operators.add": OperatorNode,
  "operators.subtract": OperatorNode,
  "operators.multiply": OperatorNode,
  "operators.divide": OperatorNode,
  "operators.modulo": OperatorNode,
  "operators.equal": OperatorNode,
  "operators.notEqual": OperatorNode,
  "operators.greaterThan": OperatorNode,
  "operators.lessThan": OperatorNode,
  "operators.greaterOrEqual": OperatorNode,
  "operators.lessOrEqual": OperatorNode,
  "operators.and": OperatorNode,
  "operators.nand": OperatorNode,
  "operators.or": OperatorNode,
  "operators.nor": OperatorNode,
  "operators.xor": OperatorNode,
  "operators.not": OperatorNode,
  // Phase 7: execution-fork nodes (Branch's True/False, Switch's per-case + Default).
  "controlFlow.branch": ControlFlowNode,
  "controlFlow.switch": ControlFlowNode,
  "controlFlow.sequence": ControlFlowNode,
  // Phase 33: annotation/comment group boxes (not nodes, purely UI).
  "annotation.commentGroup": CommentGroupNode,
};

/**
 * Falls back to `GenericNode` for any node type not explicitly listed above — most notably
 * a runtime-registered plugin node (Phase 9, `packages/core/src/plugins/plugin-node.ts`),
 * whose `type` (e.g. `"plugin.httpRequest"`) can never be a compile-time key in this map.
 * Every explicit entry above is itself a trivial pass-through to `GenericNode` anyway (see
 * e.g. `components/nodes/LogicNode.tsx`), so an unlisted type renders identically instead of
 * silently falling back to React Flow's own built-in "default" node — a bare box with one
 * nameless top handle and one nameless bottom handle, no header, no ports. Found via real
 * browser verification: an installed plugin node rendered as a blank, completely unwireable
 * box on canvas because its type wasn't a key here, and React Flow's default fallback has no
 * notion of the plugin's actual declared inputs/outputs.
 */
export const nodeTypes: NodeTypes = new Proxy(explicitNodeTypes, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (value !== undefined) return value;
    return typeof prop === "string" ? GenericNode : value;
  },
});
