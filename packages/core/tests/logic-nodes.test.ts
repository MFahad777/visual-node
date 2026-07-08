import { describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { validateFlow } from "../src/schema/validate.js";
import { getNodeDefinition, registerNode, type NodeDefinition } from "../src/schema/node-registry.js";
import type { Flow, VariableDataType } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

/** Test-only node declaring requiresAsync: true, for logic.begin's async-IIFE-wrap test. */
const beginAsyncRequiringNode: NodeDefinition = {
  type: "test.beginAsyncRequiring",
  category: "handler",
  label: "Test Begin Async Requiring",
  description: "Test-only node that declares requiresAsync: true.",
  inputs: [{ id: "in", label: "In" }],
  outputs: [],
  configSchema: [],
  requiresAsync: true,
  emit: () => ({ body: "await Promise.resolve();", order: 0 }),
};
if (!getNodeDefinition(beginAsyncRequiringNode.type)) registerNode(beginAsyncRequiringNode);

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

  it("exports a variable via a Get Variable node wired into the Variables pin", () => {
    const flow = makeFlow(
      [
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: "e1", source: "var_get", target: "exp1", sourceHandle: "value", targetHandle: "variables" }],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
    const { code } = emitExpress(flow);
    expect(code).toContain("module.exports = { counter };");
  });

  it("exports both functions and variables together", () => {
    const flow = makeFlow(
      [
        { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "a", params: "", body: "return 1;" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [
        { id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "var_get", target: "exp1", sourceHandle: "value", targetHandle: "variables" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" }];

    const { code } = emitExpress(flow);
    expect(code).toContain("module.exports = { a, counter };");
  });

  it("rejects exporting a const variable with no default value", () => {
    const flow = makeFlow(
      [
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: "e1", source: "var_get", target: "exp1", sourceHandle: "value", targetHandle: "variables" }],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "const", dataType: "number" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no guaranteed top-level declaration"))).toBe(true);
  });

  it("rejects exporting the same variable more than once, even via two separate Get Variable nodes", () => {
    const flow = makeFlow(
      [
        { id: "var_get_a", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "var_get_b", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [
        { id: "e1", source: "var_get_a", target: "exp1", sourceHandle: "value", targetHandle: "variables" },
        { id: "e2", source: "var_get_b", target: "exp1", sourceHandle: "value", targetHandle: "variables" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('cannot export variable "counter" more than once'))).toBe(true);
  });

  it("rejects exporting the same function more than once", () => {
    const flow = makeFlow(
      [
        { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "a", params: "", body: "return 1;" } },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [
        { id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('cannot export function "a" more than once'))).toBe(true);
  });

  it("rejects a non-Get-Variable node wired into the Export node's Variables pin", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: "e1", source: "init", target: "exp1", sourceHandle: "out", targetHandle: "variables" }],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"Variables" input can only be connected to Get Variable nodes'))).toBe(true);
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

  it("never emits a bare `const counter;` for a const variable with no default value — that's a JS SyntaxError", () => {
    const flow = flowWithVariable("const");
    flow.variables = [{ id: "v1", name: "counter", keyword: "const", dataType: "number" }];
    const { code } = emitExpress(flow);
    expect(code).not.toMatch(/const counter;/);
    // The Set node is wired into the reachable route chain, so its own scoped declaration is
    // the variable's only declaration+initialization point.
    expect(code).toContain("const counter = (1);");
  });

  it("declares nothing for a const variable with no default and no Set node at all", () => {
    const flow: Flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "const", dataType: "number" }];
    const { code } = emitExpress(flow);
    expect(code).not.toContain("counter");
  });

  it("drops a Set Variable node dropped on canvas but never wired into any chain — no declaration, no assignment, even for a const with no default", () => {
    const flow: Flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
        // Freshly dropped from the Variables panel's "Set" option, not connected to anything.
        { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: "1" } } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "const", dataType: "number" }];
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
    const { code } = emitExpress(flow);
    expect(code).not.toContain("counter");
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

  describe("Set Variable literal formatting is per-dataType, not raw JS source", () => {
    function flowWithTypedVariable(dataType: VariableDataType, literalValue: unknown): Flow {
      const flow = makeFlow(
        [
          { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
          { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
          { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: literalValue } } },
          { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
          { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
        ],
        [
          { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
          { id: "e2", source: "route", target: "var_set", sourceHandle: "out", targetHandle: "in" },
          { id: "e3", source: "var_set", target: "handler", sourceHandle: "out", targetHandle: "in" },
          { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
        ],
      );
      flow.variables = [{ id: "v1", name: "myVar", keyword: "let", dataType }];
      return flow;
    }

    it("wraps a plain, unquoted literal into a proper JS string literal for a string variable", () => {
      // The reported bug: typing `eqeqeqwec` (no manual quotes) used to be spliced verbatim as
      // raw JS source (a bare, undeclared identifier), not a string. It must now compile to an
      // actual quoted string literal.
      const flow = flowWithTypedVariable("string", "eqeqeqwec");
      const { code } = emitExpress(flow);
      expect(code).toContain('myVar = ("eqeqeqwec");');
    });

    it("JSON-escapes special characters in a plain string literal", () => {
      const flow = flowWithTypedVariable("string", 'say "hi"');
      const { code } = emitExpress(flow);
      expect(code).toContain('myVar = ("say \\"hi\\"");');
    });

    it("still passes a numeric literal through unwrapped for a number variable", () => {
      const flow = flowWithTypedVariable("number", 42);
      const { code } = emitExpress(flow);
      expect(code).toContain("myVar = (42);");
    });

    it("still passes a boolean literal through unwrapped for a boolean variable", () => {
      const flow = flowWithTypedVariable("boolean", true);
      const { code } = emitExpress(flow);
      expect(code).toContain("myVar = (true);");
    });

    it("wraps a plain JSON array literal in new Map(...) for a map variable", () => {
      const flow = flowWithTypedVariable("map", '[["a", 1]]');
      const { code } = emitExpress(flow);
      expect(code).toContain('myVar = (new Map([["a", 1]]));');
    });
  });
});

describe("logic.begin", () => {
  it("compiles to a no-op when unwired", () => {
    const flow = makeFlow([
      { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "helper", params: "", body: "return 1;" } },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
    const { code } = emitExpress(flow);
    expect(code).toContain("function helper() {");
  });

  it("does not require an express.init node in a pure logic-only file with an unwired Begin node", () => {
    const flow = makeFlow([
      { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
      { id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: { name: "helper", params: "", body: "return 1;" } },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  it("rejects more than one Begin node per flow", () => {
    const flow = makeFlow([
      { id: "begin1", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
      { id: "begin2", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Only one "logic.begin"'))).toBe(true);
  });

  it("emits a plain assignment for a Begin-driven Set on a let variable, ordered before routes", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: "1" } } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "begin", target: "var_set", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    expect(code).toContain("let counter = 0;");
    expect(code).toContain("counter = (1);");
    expect(code.indexOf("let counter = 0;")).toBeLessThan(code.indexOf("counter = (1);"));
    expect(code.indexOf("counter = (1);")).toBeLessThan(code.indexOf("app.get("));
  });

  it("gives a const variable with no default its sole top-level declaration, readable afterward via variable.get", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: "/srv/app" } } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "log", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: {} },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "begin", target: "var_set", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "route", target: "log", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "var_get", target: "log", sourceHandle: "value", targetHandle: "value" },
        { id: "e5", source: "log", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = [{ id: "v1", name: "DIR", keyword: "const", dataType: "string" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    expect(code).toContain('const DIR = ("/srv/app");');
    expect(code).toContain("console.log(DIR);");
  });

  it("allows a const-with-default Set placed directly on Begin's trunk (the Set's value overrides the default)", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: "5" } } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "begin", target: "var_set", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_get", target: "handler", sourceHandle: "value", targetHandle: "body" },
        { id: "e4", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e5", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "const", dataType: "number", defaultValue: "0" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    // The default value "0" should NOT be emitted; the Set's value "5" replaces it
    expect(code).not.toContain("const counter = 0;");
    expect(code).toContain("const counter = (5);");
  });

  it("allows the same const-with-default Set when placed inside a Branch arm reachable from Begin (no false positive)", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "branch", type: "controlFlow.branch", position: { x: 0, y: 0 }, data: { literals: { condition: "true" } } },
        { id: "var_set", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "v1", literals: { value: "5" } } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "begin", target: "branch", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "branch", target: "var_set", sourceHandle: "true", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = [{ id: "v1", name: "counter", keyword: "const", dataType: "number", defaultValue: "0" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    expect(code).toContain("const counter = 0;");
    expect(code).toMatch(/if \(\(true\)\) \{\s*const counter = \(5\);/);
  });

  it("wraps a requiresAsync chain in a fire-and-forget async IIFE", () => {
    const flow = makeFlow(
      [
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        { id: "asyncNode", type: "test.beginAsyncRequiring", position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: "e1", source: "begin", target: "asyncNode", sourceHandle: "out", targetHandle: "in" }],
    );
    const { code } = emitExpress(flow);
    expect(code).toContain("(async () => {");
    expect(code).toContain("await Promise.resolve();");
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
