import { describe, expect, it } from "vitest";
import { emitFunctionGraphBody, type FunctionGraph } from "../src/codegen/emit-function-graph.js";
import { getNodeDefinition, type EmitContext } from "../src/schema/node-registry.js";
import type { Flow, FlowEdge, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import { assignNode } from "../src/nodes/object/assign.node.js";

registerBuiltinNodes();
if (!getNodeDefinition(assignNode.type)) {
  const { registerNode } = await import("../src/schema/node-registry.js");
  registerNode(assignNode);
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

describe("object.assign (Phase 38)", () => {
  it("exec pass-through: resultIdentifier returns _objassign_<id>", () => {
    const def = getNodeDefinition("object.assign")!;
    const node: FlowNode = { id: "obj1", type: "object.assign", position: { x: 0, y: 0 }, data: {} };
    expect(def.resultIdentifier!(node)).toBe("_objassign_obj1");
  });

  it("emit: target + source-0 literals → const _objassign_<id> = Object.assign(target, source0);", () => {
    const def = getNodeDefinition("object.assign")!;
    const node: FlowNode = {
      id: "obj1",
      type: "object.assign",
      position: { x: 0, y: 0 },
      data: {
        literals: {
          target: "{ a: 1 }",
          "source-0": "{ b: 2 }",
        },
      },
    };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _objassign_obj1 = Object.assign(({ a: 1 }), ({ b: 2 }));");
    expect(emitted.order).toBe(0);
  });

  it("emit: falls back to {} for unwired target, undefined for unwired sources", () => {
    const def = getNodeDefinition("object.assign")!;
    const node: FlowNode = { id: "obj1", type: "object.assign", position: { x: 0, y: 0 }, data: {} };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _objassign_obj1 = Object.assign(({}), (undefined));");
  });

  it("emit: extraSources variadic pins are resolved in order", () => {
    const def = getNodeDefinition("object.assign")!;
    const node: FlowNode = {
      id: "obj1",
      type: "object.assign",
      position: { x: 0, y: 0 },
      data: {
        extraSources: [{ id: "src1" }, { id: "src2" }],
        literals: {
          target: "target",
          "source-0": "source0",
          "source-src1": "source1",
          "source-src2": "source2",
        },
      },
    };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _objassign_obj1 = Object.assign((target), (source0), (source1), (source2));");
  });

  it("emit: unwired extra sources default to undefined", () => {
    const def = getNodeDefinition("object.assign")!;
    const node: FlowNode = {
      id: "obj1",
      type: "object.assign",
      position: { x: 0, y: 0 },
      data: {
        extraSources: [{ id: "src1" }],
        literals: {
          target: "target",
          "source-0": "source0",
        },
      },
    };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _objassign_obj1 = Object.assign((target), (source0), (undefined));");
  });

  it("emit in function graph: Object.assign with wired sources", () => {
    const nodes = [
      { id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
      { id: "obj1", type: "object.assign", position: { x: 0, y: 0 }, data: { literals: { target: "base", "source-0": "override" } } },
      { id: "return1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "result" } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "obj1", target: "return1", sourceHandle: "result", targetHandle: "value" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("Object.assign((base), (override))");
    expect(body).toContain("_objassign_obj1");
  });
});
