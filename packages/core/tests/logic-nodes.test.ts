import { describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { validateFlow } from "../src/schema/validate.js";
import type { Flow } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

describe("logic.function / logic.export", () => {
  it("emits a function declaration and module.exports for a connected pair", () => {
    const flow = makeFlow(
      [
        { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "formatDate", params: "date", body: "return date.toISOString();" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" }],
    );

    const { code } = emitExpress(flow);
    expect(code).toContain("function formatDate(date) {");
    expect(code).toContain("return date.toISOString();");
    expect(code).toContain("module.exports = { formatDate };");
  });

  it("emits multiple exported functions from a single Export node", () => {
    const flow = makeFlow(
      [
        { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "a", params: "", body: "return 1;" } },
        { id: "fn2", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "b", params: "", body: "return 2;" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [
        { id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "fn2", target: "exp1", sourceHandle: "out", targetHandle: "in" },
      ],
    );

    const { code } = emitExpress(flow);
    expect(code).toContain("module.exports = { a, b };");
  });

  it("emits an empty module.exports when Export has no connections", async () => {
    const flow = makeFlow([{ id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} }]);
    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    expect(formatted).toContain("module.exports = {};");
  });

  it("keeps an unexported Function node as a private, still-emitted helper", () => {
    const flow = makeFlow([
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "helper", params: "", body: "return 42;" } },
    ]);
    const { code } = emitExpress(flow);
    expect(code).toContain("function helper() {");
  });

  it("rejects more than one Export node per flow", () => {
    const flow = makeFlow([
      { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      { id: "exp2", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Only one"))).toBe(true);
  });

  it("rejects an Export node connected to a non-Function node", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: "e1", source: "init", target: "exp1", sourceHandle: "out", targetHandle: "in" }],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("can only be connected to Function nodes"))).toBe(true);
  });

  it("does not require an express.init node in a pure logic-only file", () => {
    const flow = makeFlow([
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "helper", params: "", body: "return 1;" } },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });
});

describe("logic.require", () => {
  it("emits a require() import with the configured variable name and path", () => {
    const flow = makeFlow([
      { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/dateFormater", variableName: "dateHelper" } },
    ]);
    const { code } = emitExpress(flow);
    expect(code).toContain('const dateHelper = require("../helpers/dateFormater");');
  });

  it("rejects a Require node with an invalid variable name", () => {
    const flow = makeFlow([
      { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "./x", variableName: "1invalid" } },
    ]);
    expect(() => emitExpress(flow)).toThrow(/invalid variable name/);
  });
});

describe("logic.require — npm mode", () => {
  it("emits a require() import for a valid npm package name", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { sourceType: "npm", path: "axios", variableName: "axios", version: "^1.7.0" },
      },
    ]);
    const { code } = emitExpress(flow);
    expect(code).toContain('const axios = require("axios");');
  });

  it("rejects an invalid npm package name", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { sourceType: "npm", path: "Not A Valid Name!", variableName: "x" },
      },
    ]);
    expect(() => emitExpress(flow)).toThrow(/invalid npm package name/);
  });

  it("rejects an invalid version specifier", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { sourceType: "npm", path: "axios", variableName: "axios", version: "not@@valid" },
      },
    ]);
    expect(() => emitExpress(flow)).toThrow(/invalid version specifier/);
  });

  it("treats a node with no sourceType at all as local mode (backward compat)", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { path: "../helpers/dateFormater", variableName: "dateHelper" },
      },
    ]);
    const { code } = emitExpress(flow);
    expect(code).toContain('const dateHelper = require("../helpers/dateFormater");');
  });
});

describe("duplicate top-level bindings", () => {
  it("rejects a Function name colliding with a Require variable name", () => {
    const flow = makeFlow([
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "shared", params: "", body: "return 1;" } },
      { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "./x", variableName: "shared" } },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("declared more than once"))).toBe(true);
  });
});

describe("variable.get / variable.set", () => {
  function flowWithVariable(
    keyword: "const" | "let" | "var",
    extraNodes: Flow["nodes"] = [],
    extraEdges: Flow["edges"] = [],
  ): Flow {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: "1" } } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
        ...extraNodes,
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "var_set", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_set", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
        ...extraEdges,
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword, dataType: "number", defaultValue: "0" }];
    return flow;
  }

  it("emits a module-level declaration and an assignment statement for a valid let variable", () => {
    const flow = flowWithVariable("let");
    const { code } = emitExpress(flow);
    expect(code).toContain("let counter = 0;");
    expect(code).toContain("counter = (1);");
  });

  it("compiles a Set Variable node targeting a const variable as its own scoped const redeclaration", () => {
    const flow = flowWithVariable("const");
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
    const { code } = emitExpress(flow);
    expect(code).toContain("const counter = 0;");
    expect(code).toContain("const counter = (1);");
  });

  it("rejects a Get Variable node with a dangling/unknown variableId", () => {
    const flow = flowWithVariable("let", [{ id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "does-not-exist" } }]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.nodeId === "var_get" && e.message.includes("references unknown variable"))).toBe(true);
  });

  it("rejects a Set Variable node with a dangling/unknown variableId", () => {
    const flow = makeFlow([
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
      { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "does-not-exist", literals: { value: "1" } } },
      { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.nodeId === "var_set" && e.message.includes("references unknown variable"))).toBe(true);
  });

  it("rejects a variable with an invalid identifier name", () => {
    const flow = flowWithVariable("let");
    flow.variables = [{ id: "v1", name: "1invalid", keyword: "let", dataType: "string" }];
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("invalid name"))).toBe(true);
  });

  it("rejects two variables declared with the same name", () => {
    const flow = flowWithVariable("let");
    flow.variables = [
      { id: "v1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" },
      { id: "v2", name: "counter", keyword: "let", dataType: "number", defaultValue: "1" },
    ];
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("declared more than once"))).toBe(true);
  });

  it("accepts a valid Get/Set pair wired to a real declared variable", () => {
    const flow = flowWithVariable("let", [{ id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } }]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });
});

describe("debug.consoleLog", () => {
  it("can sit directly after a Route (broadened handler-chain-entry category)", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "log", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: { expression: '"hit"' } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "log", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "log", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    const logIdx = code.indexOf('console.log("hit");');
    const sendIdx = code.indexOf("res.status(200)");
    expect(logIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(logIdx);
  });

  it("logs the wired value pin's result instead of the typed Expression, and hoists its producer", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "add",
          type: "operators.add",
          position: { x: 0, y: 0 },
          data: { literals: { a: 2, b: 3 } },
        },
        // The typed Expression must be ignored once "value" is wired.
        { id: "log", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: { expression: '"should not appear"' } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "log", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "add", target: "log", sourceHandle: "result", targetHandle: "value" },
        { id: "e4", source: "log", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e5", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    expect(code).not.toContain("should not appear");
    const addIdx = code.indexOf("const _op_add = ((2) + (3));");
    const logIdx = code.indexOf("console.log(_op_add);");
    expect(addIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(addIdx);
  });
});
