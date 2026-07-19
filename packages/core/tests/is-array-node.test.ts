import { describe, expect, it } from "vitest";
import { emitFunctionGraphBody, type FunctionGraph } from "../src/codegen/emit-function-graph.js";
import { getNodeDefinition, type EmitContext } from "../src/schema/node-registry.js";
import type { Flow, FlowEdge, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import { isArrayNode } from "../src/nodes/array/is-array.node.js";

registerBuiltinNodes();
if (!getNodeDefinition(isArrayNode.type)) {
  const { registerNode } = await import("../src/schema/node-registry.js");
  registerNode(isArrayNode);
}

const emptyCtx: EmitContext = {
  flow: { version: "1", meta: { name: "test", target: "express" }, nodes: [], edges: [] },
  getNode: () => undefined,
  getIncoming: () => [],
  getOutgoing: () => [],
  emitNode: () => {
    throw new Error("unused in these tests");
  },
};

describe("array.isArray (Phase 38)", () => {
  it("pure value node — resultIdentifier returns _arr_<id>", () => {
    const def = getNodeDefinition("array.isArray")!;
    const node: FlowNode = { id: "arr1", type: "array.isArray", position: { x: 0, y: 0 }, data: {} };
    expect(def.resultIdentifier!(node)).toBe("_arr_arr1");
  });

  it("emit: literal value pin → const _arr_<id> = Array.isArray(<expr>);", () => {
    const def = getNodeDefinition("array.isArray")!;
    const node: FlowNode = {
      id: "arr1",
      type: "array.isArray",
      position: { x: 0, y: 0 },
      data: { literals: { value: "[1, 2, 3]" } },
    };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _arr_arr1 = Array.isArray(([1, 2, 3]));");
    expect(emitted.order).toBe(0);
  });

  it("emit: unwired value pin falls back to undefined literal", () => {
    const def = getNodeDefinition("array.isArray")!;
    const node: FlowNode = { id: "arr1", type: "array.isArray", position: { x: 0, y: 0 }, data: {} };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _arr_arr1 = Array.isArray((undefined));");
  });

  it("emit in function graph: Array.isArray on a wired value source", () => {
    const nodes = [
      { id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
      { id: "arr1", type: "array.isArray", position: { x: 0, y: 0 }, data: { literals: { value: "items" } } },
      { id: "return1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "result" } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "arr1", target: "return1", sourceHandle: "result", targetHandle: "value" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("Array.isArray((items))");
    expect(body).toContain("_arr_arr1");
  });
});
