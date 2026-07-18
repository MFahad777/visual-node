import { describe, expect, it } from "vitest";
import { emitFunctionGraphBody, type FunctionGraph } from "../src/codegen/emit-function-graph.js";
import { validateFlow } from "../src/schema/validate.js";
import { getNodeDefinition, registerNode } from "../src/schema/node-registry.js";
import type { Flow, FlowEdge, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import { throwNode } from "../src/nodes/error/throw.node.js";

registerBuiltinNodes();
if (!getNodeDefinition(throwNode.type)) registerNode(throwNode);

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function throwNode_(id: string, valueLiteral?: string): FlowNode {
  return { id, type: "error.throw", position: { x: 0, y: 0 }, data: { literals: valueLiteral ? { value: valueLiteral } : {} } };
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function variableGet(id: string, variableId: string): FlowNode {
  return { id, type: "variable.get", position: { x: 0, y: 0 }, data: { variableId } };
}

describe("error.throw — unit tests", () => {
  it("literal value pin → throw (expr);", () => {
    const nodes = [
      graphEntry("entry1"),
      throwNode_("throw1", '"oops"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "throw1", sourceHandle: "out", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("throw");
    expect(body).toContain("oops");
  });

  it("literal fallback → throw <literal>;", () => {
    const nodes = [
      graphEntry("entry1"),
      throwNode_("throw1", '"custom error"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "throw1", sourceHandle: "out", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("throw");
    expect(body).toContain("custom error");
  });

  it("validation rejects unwired value with no literal", () => {
    const nodes = [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { path: "/", method: "GET" } },
      { id: "handler", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "h1", mode: "blueprint" } },
      throwNode_("throw1"), // No wiring, no literal
    ];
    const edges = [
      { id: "e1", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "app" },
      { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "handler" },
      { id: "e4", source: "handler", target: "throw1", sourceHandle: "out", targetHandle: "in" },
    ];

    const flow = makeFlow(nodes, edges);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("not connected and has no literal value"))).toBe(true);
  });

  it("validation rejects multiple incoming value wires", () => {
    const nodes = [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { path: "/", method: "GET" } },
      { id: "handler", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "h1", mode: "blueprint" } },
      throwNode_("throw1"),
      { id: "get1", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
      { id: "get2", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v2" } },
    ];
    const edges = [
      { id: "e1", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "app" },
      { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "handler" },
      { id: "e4", source: "handler", target: "throw1", sourceHandle: "out", targetHandle: "in" },
      { id: "e5", source: "get1", target: "throw1", sourceHandle: "out", targetHandle: "value" },
      { id: "e6", source: "get2", target: "throw1", sourceHandle: "out", targetHandle: "value" }, // WRONG: two wires on one pin
    ];

    const flow = makeFlow(nodes, edges);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("more than one incoming connection"))).toBe(true);
  });
});
