import { describe, expect, it, afterAll } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import type { Flow, FlowNode, FlowEdge } from "../src/schema/node.types.js";
import { validateFlow } from "../src/schema/validate.js";
import { collectFlowDependencies } from "../src/project/collect-dependencies.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Port registry: core spawn-test ports include 3000, 3991-3999; handler-function uses 4010
const HANDLER_FUNCTION_PORT = 4010;
const HANDLER_FUNCTION_GENERATED_PATH = path.join(__dirname, "fixtures", "generated-handler-function", "server.js");

afterAll(() => {
  rmSync(path.join(__dirname, "fixtures", "generated-handler-function"), { recursive: true, force: true });
});

function makeFlow(nodes: FlowNode[], edges: FlowEdge[]): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function initNode(): FlowNode {
  return { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} };
}

function listenNode(port: number): FlowNode {
  return { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } };
}

describe("Handler Function node — code mode", () => {
  it("emits a standalone function declaration", () => {
    const flow = makeFlow(
      [
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "myHandler", body: 'res.json({ ok: true });', mode: "code" } },
      ],
      [],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("function myHandler(req, res, next) {");
    expect(code).toContain('res.json({ ok: true });');
  });

  it("respects isAsync: true and emits an async function", () => {
    const flow = makeFlow(
      [
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "myHandler", body: "res.json({ ok: true });", mode: "code", isAsync: true } },
      ],
      [],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("async function myHandler(req, res, next) {");
  });

  it("throws on invalid function name", () => {
    const flow = makeFlow(
      [
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "123invalid", body: "res.json({ ok: true });", mode: "code" } },
      ],
      [],
    );
    expect(() => emitExpress(flow)).toThrow(/invalid function name/i);
  });

  it("collects npm dependencies from npmDependencies field via collectFlowDependencies", () => {
    // npmDependencies is a package.json-only declaration (see collect-dependencies.ts) — it
    // does not itself emit a require() line; the user's own code body does that if needed.
    const flow = makeFlow(
      [
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "myHandler", body: "res.json({ ok: true });", mode: "code", npmDependencies: "axios, lodash@^4.17.0" } },
      ],
      [],
    );
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies.axios).toBeDefined();
    expect(dependencies.lodash).toBe("^4.17.0");
  });
});

describe("Handler Function node — blueprint mode", () => {
  it("emits a function whose body is compiled from a nested node graph", () => {
    const flow = makeFlow(
      [
        {
          id: "hf1",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "myHandler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                { id: "sendJson", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } },
              ],
              edges: [{ id: "e1", source: "entry1", target: "sendJson", sourceHandle: "out", targetHandle: "in" }],
            },
          },
        },
      ],
      [],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("function myHandler(req, res, next) {");
    // handler.sendJson emits res.status().json()
    expect(code).toContain("res.status(200).json");
  });

  it("validates a blueprint-mode Handler Function and reports errors", () => {
    const flow = makeFlow(
      [
        {
          id: "hf1",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "myHandler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                // A Return node wired to a pin that doesn't exist on the entry node
                { id: "ret", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { value: "123" } },
              ],
              edges: [
                { id: "e1", source: "entry1", sourceHandle: "nonexistent", target: "ret" },
              ],
            },
          },
        },
      ],
      [],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("respects isAsync: true in blueprint mode", () => {
    const flow = makeFlow(
      [
        {
          id: "hf1",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "myHandler",
            mode: "blueprint",
            isAsync: true,
            graph: {
              nodes: [
                { id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
              ],
              edges: [],
            },
          },
        },
      ],
      [],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("async function myHandler(req, res, next) {");
  });
});

describe("Route → Handler Function connection", () => {
  it("wires a Route to a Handler Function by name", () => {
    const flow = makeFlow(
      [
        initNode(),
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "myHandler", body: 'res.json({ ok: true });', mode: "code" } },
        { id: "route1", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/test" } },
        listenNode(3000),
      ],
      [
        { id: "e1", source: "init", target: "route1" },
        { id: "e2", source: "route1", target: "hf1" },
        { id: "e3", source: "init", target: "listen" },
      ],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("function myHandler(req, res, next) {");
    expect(code).toContain('app.get("/test", myHandler);');
  });

  it("fails validation if Route is not connected to a Handler Function", () => {
    const flow = makeFlow(
      [
        initNode(),
        { id: "route1", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/test" } },
        { id: "sendJson", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } },
        listenNode(3000),
      ],
      [
        { id: "e1", source: "init", target: "route1" },
        { id: "e2", source: "route1", target: "sendJson" },
        { id: "e3", source: "init", target: "listen" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.nodeId === "route1" && e.message.includes("Handler Function"))).toBe(true);
  });

  it("allows multiple Routes to share one Handler Function", () => {
    const flow = makeFlow(
      [
        initNode(),
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "jsonHandler", body: 'res.json({ msg: "shared" });', mode: "code" } },
        { id: "route1", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/one" } },
        { id: "route2", type: "express.route", position: { x: 0, y: 0 }, data: { method: "POST", path: "/two" } },
        listenNode(3000),
      ],
      [
        { id: "e1", source: "init", target: "route1" },
        { id: "e2", source: "route1", target: "hf1" },
        { id: "e3", source: "init", target: "route2" },
        { id: "e4", source: "route2", target: "hf1" },
        { id: "e5", source: "init", target: "listen" },
      ],
    );
    const { code } = emitExpress(flow);
    // Handler function emitted exactly once
    const matches = (code.match(/function jsonHandler\(/g) ?? []).length;
    expect(matches).toBe(1);
    // Both routes reference it
    expect(code).toContain('app.get("/one", jsonHandler);');
    expect(code).toContain('app.post("/two", jsonHandler);');
  });
});

describe("Handler Function — alwaysCollect behavior (Phase 24)", () => {
  it("emits an unwired Handler Function at file scope (no Route attached yet)", () => {
    // This tests the `alwaysCollect: true` mechanism: unlike variable.set (collected only if
    // reachable), a Handler Function should be emitted even if no Route is wired to it yet.
    const flow = makeFlow(
      [
        { id: "hf1", type: "logic.handlerFunction", position: { x: 0, y: 0 }, data: { name: "orphanHandler", body: 'res.json({ unused: true });', mode: "code" } },
      ],
      [],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("function orphanHandler(req, res, next) {");
  });
});

describe("end-to-end: Route → Handler Function → real HTTP", () => {
  it("generates a server with two routes sharing one Handler Function, then serves real requests", async () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "handler-function-test", target: "express" },
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: "hf1",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "sharedHandler",
            body: `res.status(200).json({ method: req.method, path: req.path });`,
            mode: "code",
          },
        },
        { id: "route_get", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/shared" } },
        { id: "route_post", type: "express.route", position: { x: 0, y: 0 }, data: { method: "POST", path: "/shared" } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: HANDLER_FUNCTION_PORT } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route_get" },
        { id: "e2", source: "route_get", target: "hf1" },
        { id: "e3", source: "init", target: "route_post" },
        { id: "e4", source: "route_post", target: "hf1" },
        { id: "e5", source: "init", target: "listen" },
      ],
    };

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    await writeGeneratedFile(HANDLER_FUNCTION_GENERATED_PATH, formatted);

    // Write a CommonJS package.json so Node doesn't misidentify it as ESM
    writeFileSync(
      path.join(path.dirname(HANDLER_FUNCTION_GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "handler-function-test", private: true }),
    );

    const child = spawn(process.execPath, [HANDLER_FUNCTION_GENERATED_PATH], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await waitForOutput(child, `Server running on port ${HANDLER_FUNCTION_PORT}`, 10_000);

      // GET request
      const getRes = await fetch(`http://localhost:${HANDLER_FUNCTION_PORT}/shared`);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.method).toBe("GET");

      // POST request
      const postRes = await fetch(`http://localhost:${HANDLER_FUNCTION_PORT}/shared`, { method: "POST" });
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.method).toBe("POST");
    } finally {
      child.kill();
    }
  }, 15_000);
});

// Helper: waits for a substring to appear in spawned process output
async function waitForOutput(child: any, substring: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes(substring)) {
        cleanup();
        resolve();
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      child.stdout?.removeListener("data", onData);
      child.stderr?.removeListener("data", onData);
      child.removeListener("error", onError);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", onError);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for output: "${substring}"`));
    }, timeoutMs);
    child.on("exit", () => {
      clearTimeout(timer);
      cleanup();
      if (!output.includes(substring)) {
        reject(new Error(`Process exited before output "${substring}" appeared`));
      }
    });
  });
}
