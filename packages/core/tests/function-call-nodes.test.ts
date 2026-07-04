import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { validateFlow } from "../src/schema/validate.js";
import { compileProject } from "../src/project/compile-project.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import type { Flow } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-function-call-project");
// Distinct from other core/editor-server test files spawning real servers:
// integration.test.ts=3000/3993/3998, editor-server run.routes.test.ts=3001,
// compile-project.test.ts=3997, branch/switch/operator/function-graph=3991-3995.
const PORT = 3996;
const BEGIN_INLINE_PORT = 3999;

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

// logic.functionCall's emit() deliberately returns only `body`, never `setup` (it only makes
// sense inside a request handler) — so exercising it requires a full express.init -> route ->
// Function Call chain-entry wiring, the same way the real app would pull it into a handler body,
// rather than calling emitExpress on a bare require+functionCall flow (which would silently emit
// nothing at the top level, since collectLogicNodes only surfaces `setup` fragments).
describe("logic.functionCall — emit", () => {
  it("emits a bare call statement (no assignment) with a literal arg-0 value when Result is unwired", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/printer",
            variableName: "printerFunctions",
            functionName: "printer",
            params: "data",
            "arg-0": '"hello"',
            resultVariable: "printerResult",
          },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "call1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );

    const { code } = emitExpress(flow);
    // Result output has no outgoing edge: a pure fire-and-forget call, not an unused `const`.
    expect(code).toContain('printerFunctions.printer("hello");');
    expect(code).not.toContain("printerResult");
  });

  it("inlines the call directly into an immediately-adjacent Set Variable node's assignment, skipping resultVariable entirely", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      variables: [{ id: "var1", name: "printResult", keyword: "let", dataType: "string" }],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/printer",
            variableName: "printerFunctions",
            functionName: "printer",
            params: "data",
            "arg-0": '"hello"',
            resultVariable: "printerResult",
          },
        },
        { id: "set1", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "var1" } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "call1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "call1", target: "set1", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "call1", target: "set1", sourceHandle: "result", targetHandle: "value" },
        { id: "e5", source: "set1", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const { code } = emitExpress(flow);
    // Set node sits directly next in the exec chain, so the call is embedded straight into its
    // assignment — no intermediate `resultVariable` declaration at all.
    expect(code).toContain('printResult = printerFunctions.printer("hello");');
    expect(code).not.toContain("printerResult");
  });

  it("falls back to declaring resultVariable when the Set Variable node is NOT the immediate next exec node", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      variables: [{ id: "var1", name: "printResult", keyword: "let", dataType: "string" }],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/printer",
            variableName: "printerFunctions",
            functionName: "printer",
            params: "data",
            "arg-0": '"hello"',
            resultVariable: "printerResult",
          },
        },
        { id: "log1", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: {} },
        { id: "set1", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "var1" } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "call1", sourceHandle: "out", targetHandle: "in" },
        // call1's exec successor is log1, NOT set1 — set1 is still call1's Result's sole
        // consumer, but it isn't the immediate next node, so inlining would fire the call later
        // than wired (after log1 runs) and must not happen.
        { id: "e3", source: "call1", target: "log1", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "call1", target: "set1", sourceHandle: "result", targetHandle: "value" },
        { id: "e5", source: "log1", target: "set1", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "set1", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e7", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const { code } = emitExpress(flow);
    expect(code).toContain('const printerResult = printerFunctions.printer("hello");');
    expect(code).toContain("printResult = (printerResult);");
  });

  it("chains call B's param-0 to call A's resultVariable, not a literal", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/math", variableName: "mathHelpers" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "callA",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/math",
            variableName: "mathHelpers",
            functionName: "double",
            params: "n",
            "arg-0": "21",
            resultVariable: "doubled",
          },
        },
        {
          id: "callB",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/math",
            variableName: "mathHelpers",
            functionName: "increment",
            params: "n",
            resultVariable: "incremented",
          },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "callA", sourceHandle: "out", targetHandle: "in" },
        // Chain-continuation edge (control flow: callA runs, then callB runs).
        { id: "e3", source: "callA", target: "callB", sourceHandle: "out", targetHandle: "in" },
        // Param-wiring edge (value flow: callB's arg 0 comes from callA's result), distinct
        // from the chain-continuation edge above — this is the pairing the whole feature hinges on.
        { id: "e4", source: "callA", target: "callB", sourceHandle: "result", targetHandle: "param-0" },
        { id: "e5", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );

    const { code } = emitExpress(flow);
    // callA's Result is wired into callB's param-0, so callA still gets its assignment...
    expect(code).toContain("const doubled = mathHelpers.double(21);");
    // ...but callB's own Result is unwired, so it's a bare fire-and-forget call, not an
    // unused `const incremented`.
    expect(code).toContain("mathHelpers.increment(doubled);");
    expect(code).not.toContain("const incremented");
    // Must reference the upstream result variable, never a literal "21" as call B's argument.
    expect(code).not.toContain("mathHelpers.increment(21)");
  });
});

describe("logic.functionCall — validation", () => {
  it("rejects a Function Call whose variableName matches no Require node in the flow", () => {
    const flow = makeFlow([
      {
        id: "call1",
        type: "logic.functionCall",
        position: { x: 0, y: 0 },
        data: {
          requirePath: "../helpers/printer",
          variableName: "printerFunctions",
          functionName: "printer",
          params: "data",
          "arg-0": '"x"',
          resultVariable: "result1",
        },
      },
    ]);

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no Require node in this file defines it"))).toBe(true);
  });

  it("rejects a duplicate resultVariable shared by two Function Call nodes", () => {
    const flow = makeFlow([
      { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
      {
        id: "call1",
        type: "logic.functionCall",
        position: { x: 0, y: 0 },
        data: {
          requirePath: "../helpers/printer",
          variableName: "printerFunctions",
          functionName: "printer",
          params: "data",
          "arg-0": '"a"',
          resultVariable: "shared",
        },
      },
      {
        id: "call2",
        type: "logic.functionCall",
        position: { x: 0, y: 0 },
        data: {
          requirePath: "../helpers/printer",
          variableName: "printerFunctions",
          functionName: "printer",
          params: "data",
          "arg-0": '"b"',
          resultVariable: "shared",
        },
      },
    ]);

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("declared more than once"))).toBe(true);
  });

  it("rejects a duplicate resultVariable colliding with a Function name", () => {
    const flow = makeFlow([
      { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "shared", params: "", body: "return 1;" } },
      {
        id: "call1",
        type: "logic.functionCall",
        position: { x: 0, y: 0 },
        data: {
          requirePath: "../helpers/printer",
          variableName: "printerFunctions",
          functionName: "printer",
          params: "data",
          "arg-0": '"a"',
          resultVariable: "shared",
        },
      },
    ]);

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("declared more than once"))).toBe(true);
  });

  it("rejects param-0 wired from a non-Function-Call node (logic.function)", () => {
    const flow = makeFlow(
      [
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
        { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "helper", params: "", body: "return 1;" } },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/printer",
            variableName: "printerFunctions",
            functionName: "printer",
            params: "data",
            resultVariable: "result1",
          },
        },
      ],
      [{ id: "e1", source: "fn1", target: "call1", sourceHandle: "out", targetHandle: "param-0" }],
    );

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("can only be connected to another Function Call node"))).toBe(true);
  });

  it("rejects param-0 wired from a non-Function-Call node (express.init)", () => {
    const flow = makeFlow(
      [
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/printer",
            variableName: "printerFunctions",
            functionName: "printer",
            params: "data",
            resultVariable: "result1",
          },
        },
      ],
      [{ id: "e1", source: "init", target: "call1", sourceHandle: "out", targetHandle: "param-0" }],
    );

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("can only be connected to another Function Call node"))).toBe(true);
  });

  it("allows a Function Call node directly after a Route (handler-chain-entry extension)", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/printer", variableName: "printerFunctions" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/printer",
            variableName: "printerFunctions",
            functionName: "printer",
            params: "data",
            "arg-0": '"hi"',
            resultVariable: "printResult",
          },
        },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "call1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "call1", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });
});

describe("logic.functionCall — real end-to-end compile + spawn + curl", () => {
  const mathHelperFlow: Flow = {
    version: "1",
    meta: { name: "mathHelper", target: "express" },
    nodes: [
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "square", params: "n", body: "return n * n;" } },
      { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [{ id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" }],
  };

  function serverFlow(port: number): Flow {
    return {
      version: "1",
      meta: { name: "server", target: "express" },
      // Function Call's Result output is only assigned when wired (see function-call.node.ts) —
      // a `variable.set` node is how the call's return value is kept under a stable name for
      // later reference from Custom Code, same pattern as the Phase 10/11 variables tests.
      variables: [{ id: "var1", name: "squared", keyword: "let", dataType: "number" }],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: "req1",
          type: "logic.require",
          position: { x: 0, y: 0 },
          data: { path: "../helpers/mathHelper", variableName: "mathHelper" },
        },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/square" } },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/mathHelper",
            variableName: "mathHelper",
            functionName: "square",
            params: "n",
            "arg-0": "7",
            resultVariable: "squaredResult",
          },
        },
        { id: "set1", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "var1" } },
        {
          id: "handler",
          type: "handler.customCode",
          position: { x: 0, y: 0 },
          data: { code: "res.json({ squared });" },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "call1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "call1", target: "set1", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "call1", target: "set1", sourceHandle: "result", targetHandle: "value" },
        { id: "e5", source: "set1", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };
  }

  it(
    "compiles a helper + server file with a chain-entry Function Call, spawns the real server, and returns the actual function's return value over HTTP",
    async () => {
      const result = await compileProject([
        { relativePath: "helpers/mathHelper.blueprint", flow: mathHelperFlow },
        { relativePath: "src/server.blueprint", flow: serverFlow(PORT) },
      ]);

      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(result.files.map((f) => f.relativePath).sort()).toEqual(["helpers/mathHelper.js", "src/server.js"]);

      for (const file of result.files) {
        await writeGeneratedFile(path.join(GENERATED_DIR, file.relativePath), file.code);
      }
      writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "generated-function-call-project", private: true }));

      const serverPath = path.join(GENERATED_DIR, "src", "server.js");
      const child = spawn(process.execPath, [serverPath], { stdio: ["ignore", "pipe", "pipe"] });

      try {
        await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

        const res = await fetch(`http://localhost:${PORT}/square`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.squared).toBe(49); // the real square(7) return value, not a plausible-looking stub
      } finally {
        child.kill();
      }
    },
    15_000,
  );
});

describe("logic.functionCall — Begin-driven inlined Set, real end-to-end compile + spawn + curl", () => {
  const adderHelperFlow: Flow = {
    version: "1",
    meta: { name: "adderHelper", target: "express" },
    nodes: [
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "add", params: "a, b", body: "return a + b;" } },
      { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [{ id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" }],
  };

  function serverFlow(port: number): Flow {
    return {
      version: "1",
      meta: { name: "server", target: "express" },
      variables: [{ id: "var1", name: "total", keyword: "let", dataType: "number" }],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: "req1",
          type: "logic.require",
          position: { x: 0, y: 0 },
          data: { path: "../helpers/adderHelper", variableName: "adderHelper" },
        },
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: {
            requirePath: "../helpers/adderHelper",
            variableName: "adderHelper",
            functionName: "add",
            params: "a, b",
            "arg-0": "2",
            "arg-1": "3",
            resultVariable: "sum",
          },
        },
        { id: "set1", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "var1" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/total" } },
        { id: "handler", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.status(200).json({ total });" } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
      ],
      edges: [
        // Begin -> Function Call -> Set, exactly the reported shape: the call is inlined
        // straight into Set's own assignment, running once at module load.
        { id: "e1", source: "begin", target: "call1", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "call1", target: "set1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "call1", target: "set1", sourceHandle: "result", targetHandle: "value" },
        { id: "e4", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e5", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };
  }

  it(
    "inlines the call into Begin's Set node (no intermediate resultVariable), and the very first request sees the real computed value",
    async () => {
      const result = await compileProject([
        { relativePath: "helpers/adderHelper.blueprint", flow: adderHelperFlow },
        { relativePath: "src/beginServer.blueprint", flow: serverFlow(BEGIN_INLINE_PORT) },
      ]);

      expect(result.valid).toBe(true);
      if (!result.valid) return;

      const serverFile = result.files.find((f) => f.relativePath === "src/beginServer.js");
      expect(serverFile).toBeDefined();
      // Inlined straight into the Set assignment — no `const sum = ...` anywhere.
      expect(serverFile!.code).toContain("total = adderHelper.add(2, 3);");
      expect(serverFile!.code).not.toContain("sum");

      for (const file of result.files) {
        await writeGeneratedFile(path.join(GENERATED_DIR, file.relativePath), file.code);
      }
      writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "generated-function-call-project", private: true }));

      const serverPath = path.join(GENERATED_DIR, "src", "beginServer.js");
      const child = spawn(process.execPath, [serverPath], { stdio: ["ignore", "pipe", "pipe"] });

      try {
        await waitForOutput(child, `Server running on port ${BEGIN_INLINE_PORT}`, 10_000);

        const res = await fetch(`http://localhost:${BEGIN_INLINE_PORT}/total`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.total).toBe(5); // the real add(2, 3) return value, computed once at module load
      } finally {
        child.kill();
      }
    },
    15_000,
  );
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
        resolve();
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (codeExit) => {
      if (codeExit !== null && codeExit !== 0 && !output.includes(needle)) {
        clearTimeout(timer);
        reject(new Error(`Process exited with code ${codeExit}. Output:\n${output}`));
      }
    });
  });
}
