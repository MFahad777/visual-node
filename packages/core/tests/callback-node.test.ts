import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { validateFlow } from "../src/schema/validate.js";
import { getNodeDefinition, type EmitContext } from "../src/schema/node-registry.js";
import type { Flow, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const nodeRequire = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-callback");
// Distinct from other core spawn-test ports (see branch-node.test.ts's port comment for the
// full map: 3991-3999, 4011 are taken) — Phase 20.
const PORT = 4012;

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

const emptyCtx: EmitContext = {
  flow: makeFlow([]),
  getNode: () => undefined,
  getIncoming: () => [],
  getOutgoing: () => [],
  emitNode: () => {
    throw new Error("unused in these tests");
  },
};

function runEmitted(setupCode: string, body: string, resultVar: string): unknown {
  const fn = new Function("require", `${setupCode}\n${body}\nreturn ${resultVar};`);
  return fn(nodeRequire);
}

describe("logic.function — value output (Phase 20)", () => {
  it("resultIdentifier returns the function's own name for the \"value\" handle", () => {
    const def = getNodeDefinition("logic.function")!;
    const node: FlowNode = { id: "f1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "myFn" } };
    expect(def.resultIdentifier!(node, "value")).toBe("myFn");
  });

  it("resultIdentifier throws for any handle other than \"value\"", () => {
    const def = getNodeDefinition("logic.function")!;
    const node: FlowNode = { id: "f1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "myFn" } };
    expect(() => def.resultIdentifier!(node, "out")).toThrow(/produces no reusable value/);
    expect(() => def.resultIdentifier!(node, undefined)).toThrow(/produces no reusable value/);
  });

  it("emits a bare parameter when its param-<i> pin has no literal/wire", () => {
    const def = getNodeDefinition("logic.function")!;
    const node: FlowNode = {
      id: "f1",
      type: "logic.function",
      position: { x: 0, y: 0 },
      data: { name: "add", params: "a, b", body: "return a + b;" },
    };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.setup).toContain("function add(a, b) {");
  });

  it("emits a JS default value for a param-<i> pin with a literal set", () => {
    const def = getNodeDefinition("logic.function")!;
    const node: FlowNode = {
      id: "f1",
      type: "logic.function",
      position: { x: 0, y: 0 },
      data: { name: "greet", params: "name, punctuation", body: "return name + punctuation;", literals: { "param-1": "!" } },
    };
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.setup).toContain("function greet(name, punctuation = (!)) {");
  });
});

describe("logic.callback (Phase 20)", () => {
  function callbackNode(data: Record<string, unknown>): FlowNode {
    return { id: "cb1", type: "logic.callback", position: { x: 0, y: 0 }, data };
  }

  it("calls the literal function expression with literal args, in order", () => {
    const def = getNodeDefinition("logic.callback")!;
    const node = callbackNode({
      args: [{ id: "0" }, { id: "1" }],
      literals: { function: "(x, y) => x + y", "arg-0": "3", "arg-1": "4" },
    });
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _cbresult_cb1 = ((x, y) => x + y)((3), (4));");
    const result = runEmitted("", emitted.body!, "_cbresult_cb1");
    expect(result).toBe(7);
  });

  it("falls back to undefined for an unwired function pin or arg pin rather than throwing", () => {
    const def = getNodeDefinition("logic.callback")!;
    const node = callbackNode({ args: [{ id: "0" }] });
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _cbresult_cb1 = (undefined)((undefined));");
  });

  it("resultIdentifier exposes the same _cbresult_<id> the emitted body declares", () => {
    const def = getNodeDefinition("logic.callback")!;
    const node = callbackNode({});
    expect(def.resultIdentifier!(node)).toBe("_cbresult_cb1");
  });
});

describe("validateFlow — logic.callback args shape (Phase 20)", () => {
  function flowWithCallback(args: Array<{ id: string }>, extraEdges: Flow["edges"] = []): Flow {
    return makeFlow(
      [
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "cb1", type: "logic.callback", position: { x: 0, y: 0 }, data: { args, literals: { function: "() => {}" } } },
        // A value-producing node to source arg-<N> edges from — wiring them from `begin`'s own
        // exec "out" pin instead would trip the (unrelated) "more than one outgoing connection
        // from an exec output" rule, since `begin` already wires "out" to cb1's "in".
        { id: "fn", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "helper" } },
      ],
      [{ id: "e1", source: "begin", target: "cb1", sourceHandle: "out", targetHandle: "in" }, ...extraEdges],
    );
  }

  it("accepts a well-formed args list with a matching incoming edge", () => {
    const flow = flowWithCallback([{ id: "0" }], [
      { id: "e2", source: "fn", target: "cb1", sourceHandle: "value", targetHandle: "arg-0" },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  it("rejects an incoming connection referencing an arg id that no longer exists", () => {
    const flow = flowWithCallback([], [
      { id: "e2", source: "fn", target: "cb1", sourceHandle: "value", targetHandle: "arg-0" },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("references a pin that no longer exists"))).toBe(true);
  });

  it("rejects duplicate arg ids in data.args", () => {
    const flow = flowWithCallback([{ id: "dup" }, { id: "dup" }]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate arg id"))).toBe(true);
  });
});

describe("end-to-end: Phase 20 Callback — function-as-value through a \"function\"-typed variable, real HTTP request", () => {
  it("assigns a Function node's value to a function-typed variable, then Callback invokes it via a real spawned server", async () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "callback-api", target: "express" },
      // Phase 24: `handler.customCode` is gone, and there's no way to splice a dynamic identifier
      // (like the Callback node's `_cbresult_cb1` result) into a JSON response from inside a nested
      // Handler Function blueprint graph (`handler.sendJson`'s body is a static JSON literal only).
      // Instead, run the whole "assign the function, then call it" chain once at module load
      // (Begin -> Set myCallback -> Get myCallback -> Callback -> Set RESULT), then have the
      // Handler Function (code mode) read RESULT by its bare name — still proves the function
      // reference survives a real variable.set/variable.get round-trip through a real spawned
      // process, just driven by Begin instead of the route's own request-time chain.
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: "double",
          type: "logic.function",
          position: { x: 0, y: 0 },
          data: { name: "double", params: "n", body: "return n * 2;" },
        },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "setFn", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "getFn", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        {
          id: "cb1",
          type: "logic.callback",
          position: { x: 0, y: 0 },
          data: { args: [{ id: "0" }], literals: { "arg-0": "21" } },
        },
        { id: "setResult", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v2" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/call" } },
        {
          id: "handlerFn",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: { name: "callbackHandler", mode: "code", body: "res.status(200).json({ result: RESULT });" },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
      ],
      edges: [
        { id: "e1", source: "begin", target: "setFn", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "double", target: "setFn", sourceHandle: "value", targetHandle: "value" },
        { id: "e3", source: "setFn", target: "cb1", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "getFn", target: "cb1", sourceHandle: "value", targetHandle: "function" },
        { id: "e5", source: "cb1", target: "setResult", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "cb1", target: "setResult", sourceHandle: "result", targetHandle: "value" },
        { id: "e7", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e8", source: "route", target: "handlerFn", sourceHandle: "out", targetHandle: "in" },
        { id: "e9", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
      variables: [
        { id: "v1", name: "myCallback", keyword: "let", dataType: "function" },
        { id: "v2", name: "RESULT", keyword: "let", dataType: "number", defaultValue: "0" },
      ],
    };

    const validation = validateFlow(flow);
    expect(validation.valid).toBe(true);

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    const generatedPath = path.join(GENERATED_DIR, "server.js");
    await writeGeneratedFile(generatedPath, formatted);
    writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "callback-api", private: true }));

    const child = spawn(process.execPath, [generatedPath], { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

      const res = await fetch(`http://localhost:${PORT}/call`);
      expect(res.status).toBe(200);
      const body = await res.json();
      // myCallback = double (assigned via the Function node's "value" output), then Callback
      // invokes it with arg-0 = 21 -> double(21) = 42, proving the function reference actually
      // survived the variable.set/variable.get round-trip through a real spawned process.
      expect(body.result).toBe(42);
    } finally {
      child.kill();
    }
  }, 15_000);
});

function waitForOutput(child: ReturnType<typeof spawn>, needle: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${needle}". Output so far:\n${output}`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(needle)) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve();
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
