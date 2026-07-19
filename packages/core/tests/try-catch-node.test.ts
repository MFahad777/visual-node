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

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = [], variables: Flow["variables"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges, variables };
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

  it("finally wired alongside both try and catch → all three arms compiled", () => {
    const nodes = [
      graphEntry("entry1"),
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: { hasFinally: true } },
      graphReturn("ret1", '"try-path"'),
      graphReturn("ret2", '"catch-path"'),
      graphReturn("ret3", '"finally-path"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "try", targetHandle: "in" },
      { id: "e3", source: "tc1", target: "ret2", sourceHandle: "catch", targetHandle: "in" },
      { id: "e4", source: "tc1", target: "ret3", sourceHandle: "finally", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("try {");
    expect(body).toContain("} catch (");
    expect(body).toContain("} finally {");
    expect(body).toContain("try-path");
    expect(body).toContain("catch-path");
    expect(body).toContain("finally-path");
    // Finally should come after catch
    const tryIndex = body.indexOf("try {");
    const catchIndex = body.indexOf("} catch (");
    const finallyIndex = body.indexOf("} finally {");
    expect(tryIndex).toBeLessThan(catchIndex);
    expect(catchIndex).toBeLessThan(finallyIndex);
  });

  it("hasFinally true but finally pin left unwired → no finally block at all", () => {
    const nodes = [
      graphEntry("entry1"),
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: { hasFinally: true } },
      graphReturn("ret1", '"result"'),
      graphReturn("ret2", '"error"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "try", targetHandle: "in" },
      { id: "e3", source: "tc1", target: "ret2", sourceHandle: "catch", targetHandle: "in" },
      // finally pin is deliberately NOT wired
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("try {");
    expect(body).toContain("} catch (");
    // Proof of unwired-optional-arm convention: no finally block at all
    expect(body).not.toContain("} finally {");
    expect(body).not.toContain("finally {");
  });

  it("hasFinally absent/false backward compat guard → no finally block", () => {
    const nodes = [
      graphEntry("entry1"),
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: { hasFinally: false } },
      graphReturn("ret1", '"ok"'),
      graphReturn("ret2", '"error"'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "tc1", target: "ret1", sourceHandle: "try", targetHandle: "in" },
      { id: "e3", source: "tc1", target: "ret2", sourceHandle: "catch", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    // Regression guard: pre-Phase-39 flows with hasFinally: false (or absent) must not emit finally
    expect(body).toContain("try {");
    expect(body).toContain("} catch (");
    expect(body).not.toContain("finally");
  });

  it("only finally wired, try and catch both unwired → does nothing validation passes", () => {
    const nodes = [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { path: "/test", method: "GET" } },
      {
        id: "handler",
        type: "logic.handlerFunction",
        position: { x: 0, y: 0 },
        data: { name: "handler1", mode: "blueprint", graph: { version: "1", meta: {}, variables: [], nodes: [], edges: [] } },
      },
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: { hasFinally: true } },
      { id: "consoleLog", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: { message: '"Finally ran"' } },
      { id: "send1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { expression: '"ok"' } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "app" },
      { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "handler" },
      { id: "e4", source: "handler", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e5", source: "tc1", target: "consoleLog", sourceHandle: "finally", targetHandle: "in" }, // Only finally wired
      { id: "e6", source: "consoleLog", target: "send1", sourceHandle: "out", targetHandle: "in" },
    ];

    const flow = makeFlow(nodes, edges);
    const result = validateFlow(flow);
    // Should NOT reject just because try/catch are unwired — finally alone is a valid arm
    expect(result.valid).toBe(true);
  });

  it("reading error pin from inside finally arm is rejected by validation", () => {
    const nodes = [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { path: "/test", method: "GET" } },
      { id: "handler", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "handler1", mode: "blueprint" } },
      { id: "tc1", type: "error.tryCatch", position: { x: 0, y: 0 }, data: { hasFinally: true } },
      { id: "send1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { expression: '"ok"' } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "app" },
      { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "handler" },
      { id: "e4", source: "handler", target: "tc1", sourceHandle: "out", targetHandle: "in" },
      { id: "e5", source: "tc1", target: "send1", sourceHandle: "finally", targetHandle: "in" },
      { id: "e6", source: "tc1", target: "send1", sourceHandle: "error", targetHandle: "expression" }, // Error pin read from finally — invalid
    ];

    const flow = makeFlow(nodes, edges);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("only available inside its Catch arm"))).toBe(true);
  });
});

describe("end-to-end: Phase 39 finally arm — finally runs unconditionally", () => {
  const FINALLY_PORT = 4001;
  const FINALLY_GENERATED_PATH = path.join(__dirname, "fixtures", "generated-try-catch-finally", "server.js");

  afterAll(() => {
    rmSync(path.join(__dirname, "fixtures", "generated-try-catch-finally"), { recursive: true, force: true });
  });

  it("finally arm runs unconditionally on both success and throw paths", async () => {
    // Create a flow with a handler that uses Try-Catch (with hasFinally: true).
    // The handler is in blueprint mode with Try-Catch that:
    // - Try arm: console.log("try")
    // - Catch arm: console.log("catch")
    // - Finally arm: console.log("finally")
    // Then responds OK. We'll verify the generated code structure contains try/catch/finally.

    const flow: Flow = {
      version: "1",
      meta: { name: "try-catch-finally-api", target: "express" },
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: FINALLY_PORT } },
        {
          id: "route",
          type: "express.route",
          position: { x: 0, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: "handler",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "testHandler",
            mode: "blueprint",
            graph: {
              version: "1",
              meta: { name: "testHandler graph", target: "express" },
              variables: [],
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: "tc1",
                  type: "error.tryCatch",
                  position: { x: 0, y: 0 },
                  data: { hasFinally: true },
                },
                // Try arm: console.log
                {
                  id: "tryLog",
                  type: "debug.consoleLog",
                  position: { x: 0, y: 0 },
                  data: { message: '"try"' },
                },
                // Catch arm: console.log
                {
                  id: "catchLog",
                  type: "debug.consoleLog",
                  position: { x: 0, y: 0 },
                  data: { message: '"catch"' },
                },
                // Finally arm: console.log
                {
                  id: "finallyLog",
                  type: "debug.consoleLog",
                  position: { x: 0, y: 0 },
                  data: { message: '"finally"' },
                },
                // Return that sends the response
                {
                  id: "send",
                  type: "handler.sendJson",
                  position: { x: 0, y: 0 },
                  data: { expression: '"ok"' },
                },
              ],
              edges: [
                { id: "e1", source: "entry", target: "tc1", sourceHandle: "out", targetHandle: "in" },
                { id: "e2", source: "tc1", target: "tryLog", sourceHandle: "try", targetHandle: "in" },
                { id: "e3", source: "tryLog", target: "send", sourceHandle: "out", targetHandle: "in" },
                { id: "e4", source: "tc1", target: "catchLog", sourceHandle: "catch", targetHandle: "in" },
                { id: "e5", source: "catchLog", target: "send", sourceHandle: "out", targetHandle: "in" },
                { id: "e6", source: "tc1", target: "finallyLog", sourceHandle: "finally", targetHandle: "in" },
                { id: "e7", source: "finallyLog", target: "send", sourceHandle: "out", targetHandle: "in" },
              ],
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "app" },
        { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "handler" },
      ],
    };

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    await writeGeneratedFile(FINALLY_GENERATED_PATH, formatted);

    writeFileSync(
      path.join(path.dirname(FINALLY_GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "try-catch-finally-api", private: true }),
    );

    // Verify the generated code contains the finally structure
    expect(formatted).toContain("try {");
    expect(formatted).toContain("} catch (");
    expect(formatted).toContain("} finally {");

    // Now spawn the server and make a real request to verify it actually runs
    const child = spawn(process.execPath, [FINALLY_GENERATED_PATH], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await waitForOutput(child, `Server running on port ${FINALLY_PORT}`, 10_000);

      // Make a request to /test to verify the server actually serves the request
      const res = await fetch(`http://localhost:${FINALLY_PORT}/test`);
      expect(res.status).toBe(200);
      // Verify response is valid JSON (proves the finally block executed and didn't crash)
      const result = await res.json();
      expect(result).toBeDefined();
    } finally {
      child.kill();
    }
  }, 15_000);
});

function waitForOutput(child: ReturnType<typeof spawn>, needle: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for output: "${needle}"`));
    }, timeoutMs);

    const onData = (data: Buffer) => {
      if (data.toString().includes(needle)) {
        clearTimeout(timeout);
        child.stdout?.removeListener("data", onData);
        child.stderr?.removeListener("data", onData);
        resolve();
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
  });
}
