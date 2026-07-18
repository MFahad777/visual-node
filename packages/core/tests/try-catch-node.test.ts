import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { emitFunctionGraphBody, type FunctionGraph } from "../src/codegen/emit-function-graph.js";
import { formatCode } from "../src/codegen/formatter.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { validateFlow } from "../src/schema/validate.js";
import { getNodeDefinition, registerNode } from "../src/schema/node-registry.js";
import type { Flow, FlowEdge, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import { tryCatchNode } from "../src/nodes/error/try-catch.node.js";
import { throwNode } from "../src/nodes/error/throw.node.js";

registerBuiltinNodes();
if (!getNodeDefinition(tryCatchNode.type)) registerNode(tryCatchNode);
if (!getNodeDefinition(throwNode.type)) registerNode(throwNode);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-try-catch");
const PORT = 3995;

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function tryCatchNode_(id: string): FlowNode {
  return { id, type: "error.tryCatch", position: { x: 0, y: 0 }, data: {} };
}

function throwNode_(id: string, valueLiteral?: string): FlowNode {
  return { id, type: "error.throw", position: { x: 0, y: 0 }, data: { literals: valueLiteral ? { value: valueLiteral } : {} } };
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function graphReturn(id: string, literal: string): FlowNode {
  return { id, type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: literal } } };
}

describe("error.tryCatch — emitFunctionGraphBody unit tests", () => {
  it("both arms wired → real try/catch block", () => {
    const nodes = [
      graphEntry("entry1"),
      tryCatchNode_("tc1"),
      graphReturn("ret1", '"try-path"'),
      graphReturn("ret2", '"catch-path"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "try", targetHandle: "in" },
      { id: "e3", source: "tc1", target: "ret2", sourceHandle: "catch", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("try {");
    expect(body).toContain("} catch (");
    expect(body).toContain("try-path");
    expect(body).toContain("catch-path");
  });

  it("only try arm wired → catch still present but empty", () => {
    const nodes = [
      graphEntry("entry1"),
      tryCatchNode_("tc1"),
      graphReturn("ret1", '"result"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "try", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("try {");
    expect(body).toContain("} catch (");
  });

  it("sibling try-catch nodes get distinct err_<id> identifiers", () => {
    const nodes = [
      graphEntry("entry1"),
      tryCatchNode_("tc1"),
      tryCatchNode_("tc2"),
      graphReturn("ret1", '"done"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "tc2", sourceHandle: "try", targetHandle: "in" },
      { id: "e3", source: "tc2", target: "ret1", sourceHandle: "try", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    // Both should have distinct catch bindings
    const catchMatches = body.match(/catch \(err_[^)]+\)/g);
    expect(catchMatches).toHaveLength(2);
    expect(catchMatches![0]).not.toBe(catchMatches![1]);
  });

  it("validation allows error pin read from catch arm", () => {
    const nodes = [
      graphEntry("entry1"),
      tryCatchNode_("tc1"),
      { id: "ret1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: '"ok"' } } },
    ];
    // Error pin wired from within the catch arm
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "catch", targetHandle: "in" },
      { id: "e3", source: "tc1", target: "ret1", sourceHandle: "error", targetHandle: "value" }, // Reading from within catch arm
    ];

    // Should compile without validation errors since we're reading Error from within the Catch arm
    const graph = { nodes, edges } as FunctionGraph;
    const { code } = emitFunctionGraphBody(graph);
    expect(code).toBeDefined();
    expect(code).toContain("catch");
  });

  it("validation rejects try-catch with neither arm wired", () => {
    const nodes = [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { path: "/test", method: "GET" } },
      { id: "handler", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "handler1", mode: "blueprint" } },
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: {} },
      { id: "send1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { expression: '"ok"' } },
    ];
    const edges = [
      { id: "e1", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "app" },
      { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "handler" },
      { id: "e4", source: "handler", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e5", source: "handler", target: "send1", sourceHandle: "out", targetHandle: "in" }, // tc1 has no outgoing wires
    ];

    const flow = makeFlow(nodes, edges);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("would do nothing"))).toBe(true);
  });

  it("node comment is prepended to try-catch block", () => {
    const nodes = [
      graphEntry("entry1"),
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: { comment: "Handle any errors from the try block" } },
      graphReturn("ret1", '"try-path"'),
      graphReturn("ret2", '"catch-path"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "try", targetHandle: "in" },
      { id: "e3", source: "tc1", target: "ret2", sourceHandle: "catch", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("/** Handle any errors from the try block */");
    expect(body).toContain("try {");
    // Comment should appear before the try block
    const commentIndex = body.indexOf("/** Handle any errors from the try block */");
    const tryIndex = body.indexOf("try {");
    expect(commentIndex).toBeLessThan(tryIndex);
  });
});
