import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { emitFunctionGraphBody, FunctionGraphError, type FunctionGraph } from "../src/codegen/emit-function-graph.js";
import { formatCode } from "../src/codegen/formatter.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { validateFlow } from "../src/schema/validate.js";
import type { Flow, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = path.join(__dirname, "fixtures", "generated-function-graph", "server.js");
// Distinct from other core spawn-test ports: integration.test.ts=3000, function-call-nodes.test.ts=3996, compile-project.test.ts=3997.
const PORT = 3995;

afterAll(() => {
  rmSync(path.join(__dirname, "fixtures", "generated-function-graph"), { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function graphReturn(id: string): FlowNode {
  return { id, type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} };
}

function addNode(id: string, literals: Record<string, string> = {}): FlowNode {
  return { id, type: "operators.add", position: { x: 0, y: 0 }, data: { literals } };
}

function branchNode(id: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type: "controlFlow.branch", position: { x: 0, y: 0 }, data };
}

function graphReturnWithLiteral(id: string, literal: string): FlowNode {
  return { id, type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: literal } } };
}

describe("emitFunctionGraphBody", () => {
  it("passes a single parameter straight through to Return (unwired \"In\": legacy trunk-trailing fallback)", () => {
    const graph: FunctionGraph = {
      nodes: [graphEntry("entry1"), graphReturn("ret1")],
      edges: [{ id: "e1", source: "entry1", target: "ret1", sourceHandle: "x", targetHandle: "value" }],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    expect(body).toBe("return (x);");
    // eslint-disable-next-line no-new-func
    expect(new Function("x", body)(5)).toBe(5);
  });

  it("chains two parameters through an Add node and executes for real", () => {
    const graph: FunctionGraph = {
      nodes: [graphEntry("entry1"), addNode("add1"), graphReturn("ret1")],
      edges: [
        { id: "e1", source: "entry1", target: "add1", sourceHandle: "a", targetHandle: "a" },
        { id: "e2", source: "entry1", target: "add1", sourceHandle: "b", targetHandle: "b" },
        { id: "e3", source: "add1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
      ],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    // eslint-disable-next-line no-new-func
    const fn = new Function("a", "b", body);
    expect(fn(2, 3)).toBe(5);
  });

  it("falls off the end with no return statement when there is no Return node", () => {
    const graph: FunctionGraph = {
      nodes: [graphEntry("entry1"), addNode("add1", { b: "2" })],
      edges: [{ id: "e1", source: "entry1", target: "add1", sourceHandle: "a", targetHandle: "a" }],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    expect(body).not.toContain("return");
    // eslint-disable-next-line no-new-func
    expect(new Function("a", body)(10)).toBeUndefined();
  });

  it("throws FunctionGraphError on a cycle between two Add nodes", () => {
    const graph: FunctionGraph = {
      nodes: [addNode("add1"), addNode("add2")],
      edges: [
        { id: "e1", source: "add1", target: "add2", sourceHandle: "result", targetHandle: "a" },
        { id: "e2", source: "add2", target: "add1", sourceHandle: "result", targetHandle: "b" },
      ],
    };
    expect(() => emitFunctionGraphBody(graph)).toThrow(FunctionGraphError);

    let caught: unknown;
    try {
      emitFunctionGraphBody(graph);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FunctionGraphError);
    expect((caught as FunctionGraphError).nodeId).toBeDefined();
  });

  it("throws when Return's Value input is not connected", () => {
    const graph: FunctionGraph = { nodes: [graphReturn("ret1")], edges: [] };
    expect(() => emitFunctionGraphBody(graph)).toThrow(/not connected/);
  });

  it("supports a Function Call node inside the graph, resolving args from a Parameter node", () => {
    const graph: FunctionGraph = {
      nodes: [
        graphEntry("entry1"),
        {
          id: "call1",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: { requirePath: "../helpers/math", variableName: "mathHelpers", functionName: "double", params: "n", resultVariable: "doubled" },
        },
        graphReturn("ret1"),
      ],
      edges: [
        { id: "e1", source: "entry1", target: "call1", sourceHandle: "n", targetHandle: "param-0" },
        { id: "e2", source: "call1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
      ],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    expect(body).toContain("const doubled = mathHelpers.double(n);");
    expect(body).toContain("return (doubled);");
  });

  it("early return: a Branch with both arms wired to distinct Return nodes compiles to if/else, each returning in place", () => {
    const graph: FunctionGraph = {
      nodes: [graphEntry("entry1"), branchNode("b1"), graphReturnWithLiteral("retTrue", "true"), graphReturnWithLiteral("retFalse", "false")],
      edges: [
        { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "entry1", target: "b1", sourceHandle: "ok", targetHandle: "condition" },
        { id: "e3", source: "b1", target: "retTrue", sourceHandle: "true", targetHandle: "in" },
        { id: "e4", source: "b1", target: "retFalse", sourceHandle: "false", targetHandle: "in" },
      ],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    expect(body).toContain("if (");
    expect(body).toContain("else {");
    expect(body).toContain("return (true);");
    expect(body).toContain("return (false);");
    // eslint-disable-next-line no-new-func
    const fn = new Function("ok", body);
    expect(fn(true)).toBe(true);
    expect(fn(false)).toBe(false);
  });

  it("early return: a nested Branch chain returns from whichever leaf Return matches, like a getGrade()-style if/else-if chain", () => {
    const graph: FunctionGraph = {
      nodes: [
        graphEntry("entry1"),
        branchNode("bTopA"),
        branchNode("bTopB"),
        graphReturnWithLiteral("retA", '"A"'),
        graphReturnWithLiteral("retB", '"B"'),
        graphReturnWithLiteral("retC", '"C"'),
      ],
      edges: [
        { id: "e1", source: "entry1", target: "bTopA", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "entry1", target: "bTopA", sourceHandle: "isA", targetHandle: "condition" },
        { id: "e3", source: "bTopA", target: "retA", sourceHandle: "true", targetHandle: "in" },
        { id: "e4", source: "bTopA", target: "bTopB", sourceHandle: "false", targetHandle: "in" },
        { id: "e5", source: "entry1", target: "bTopB", sourceHandle: "isB", targetHandle: "condition" },
        { id: "e6", source: "bTopB", target: "retB", sourceHandle: "true", targetHandle: "in" },
        { id: "e7", source: "bTopB", target: "retC", sourceHandle: "false", targetHandle: "in" },
      ],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    // eslint-disable-next-line no-new-func
    const fn = new Function("isA", "isB", body);
    expect(fn(true, false)).toBe("A");
    expect(fn(false, true)).toBe("B");
    expect(fn(false, false)).toBe("C");
  });

  it("early return + fallback coexist: a guard-clause Branch early-returns on one arm; unrelated trunk work still falls back to a trailing Return", () => {
    const graph: FunctionGraph = {
      nodes: [
        graphEntry("entry1"),
        branchNode("guard"),
        graphReturnWithLiteral("retEarly", '"blocked"'),
        addNode("add1", { b: "1" }),
        graphReturn("retFallback"), // no "in" edge: the pre-Phase-12 shape, still legal
      ],
      edges: [
        { id: "e1", source: "entry1", target: "guard", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "entry1", target: "guard", sourceHandle: "denied", targetHandle: "condition" },
        { id: "e3", source: "guard", target: "retEarly", sourceHandle: "true", targetHandle: "in" },
        { id: "e4", source: "entry1", target: "add1", sourceHandle: "n", targetHandle: "a" },
        { id: "e5", source: "add1", target: "retFallback", sourceHandle: "result", targetHandle: "value" },
      ],
    };
    const { code: body } = emitFunctionGraphBody(graph);
    expect(body).toContain("if ((denied)) {");
    expect(body).toContain('return ("blocked");');
    // eslint-disable-next-line no-new-func
    const fn = new Function("n", "denied", body);
    expect(fn(4, true)).toBe("blocked");
    expect(fn(4, false)).toBe(5);
  });

  it('Return\'s "Value" pin supports an inline literal, not just a wire (needed since there is no dedicated Literal node type)', () => {
    const graph: FunctionGraph = { nodes: [graphReturnWithLiteral("ret1", '"A"')], edges: [] };
    const { code: body } = emitFunctionGraphBody(graph);
    expect(body).toBe('return ("A");');
    // eslint-disable-next-line no-new-func
    expect(new Function(body)()).toBe("A");
  });
});

describe("logic.function mode: blueprint — validation", () => {
  it("accepts multiple Return nodes in one blueprint graph, each wired into its own Branch arm", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "canAccess",
          params: "ok",
          mode: "blueprint",
          graph: {
            nodes: [graphEntry("entry1"), branchNode("b1"), graphReturnWithLiteral("retTrue", "true"), graphReturnWithLiteral("retFalse", "false")],
            edges: [
              { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
              { id: "e2", source: "entry1", target: "b1", sourceHandle: "ok", targetHandle: "condition" },
              { id: "e3", source: "b1", target: "retTrue", sourceHandle: "true", targetHandle: "in" },
              { id: "e4", source: "b1", target: "retFalse", sourceHandle: "false", targetHandle: "in" },
            ],
          },
        },
      },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  it("rejects a Return node whose Value pin is neither wired nor given a literal", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "broken",
          params: "",
          mode: "blueprint",
          graph: {
            nodes: [graphEntry("entry1"), graphReturn("ret1")],
            edges: [{ id: "e1", source: "entry1", target: "ret1", sourceHandle: "out", targetHandle: "in" }],
          },
        },
      },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('input "value" is not connected and has no literal value'))).toBe(true);
  });

  it("rejects an edge from the Start node referencing an undeclared parameter", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "double",
          params: "n",
          mode: "blueprint",
          graph: {
            nodes: [graphEntry("entry1"), graphReturn("ret1")],
            edges: [{ id: "e1", source: "entry1", target: "ret1", sourceHandle: "stale", targetHandle: "value" }],
          },
        },
      },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("references undeclared parameter"))).toBe(true);
  });

  it("rejects a Function Call node whose variable isn't Require'd anywhere in the file", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "wrapper",
          params: "n",
          mode: "blueprint",
          graph: {
            nodes: [
              graphEntry("entry1"),
              {
                id: "call1",
                type: "logic.functionCall",
                position: { x: 0, y: 0 },
                data: { requirePath: "../helpers/math", variableName: "mathHelpers", functionName: "double", params: "n", resultVariable: "doubled" },
              },
            ],
            edges: [{ id: "e1", source: "entry1", target: "call1", sourceHandle: "n", targetHandle: "param-0" }],
          },
        },
      },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no Require node in this file defines it"))).toBe(true);
  });

  it("accepts a valid blueprint graph wired to a real Require node", () => {
    const flow = makeFlow([
      { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/math", variableName: "mathHelpers" } },
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "wrapper",
          params: "n",
          mode: "blueprint",
          graph: {
            nodes: [
              graphEntry("entry1"),
              {
                id: "call1",
                type: "logic.functionCall",
                position: { x: 0, y: 0 },
                data: { requirePath: "../helpers/math", variableName: "mathHelpers", functionName: "double", params: "n", resultVariable: "doubled" },
              },
              graphReturn("ret1"),
            ],
            edges: [
              { id: "e1", source: "entry1", target: "call1", sourceHandle: "n", targetHandle: "param-0" },
              { id: "e2", source: "call1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
            ],
          },
        },
      },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });
});

describe("Phase 10: function-scoped variables are a namespace independent from the main canvas", () => {
  it("resolves a Get Variable node inside a function graph purely from that graph's own `variables` list", () => {
    const graph: FunctionGraph = {
      variables: [{ id: "fv1", name: "counter", keyword: "let", dataType: "number", defaultValue: "100" }],
      nodes: [
        graphEntry("entry1"),
        { id: "get1", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "fv1" } },
        graphReturn("ret1"),
      ],
      edges: [{ id: "e1", source: "get1", target: "ret1", sourceHandle: "value", targetHandle: "value" }],
    };
    // emitFunctionGraphBody() never receives the outer Flow at all — this alone proves the
    // resolution can only have come from `graph.variables`, not any top-level variable list.
    const { code } = emitFunctionGraphBody(graph);
    expect(code).toBe("let counter = 100;\nreturn (counter);");
  });

  it("compiles a top-level flow.variables entry and a same-named function-scoped graph.variables entry with no naming-collision error", async () => {
    const flow: Flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "getLocalCounter",
          params: "",
          mode: "blueprint",
          graph: {
            variables: [{ id: "fv1", name: "counter", keyword: "let", dataType: "number", defaultValue: "100" }],
            nodes: [
              { id: "get1", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "fv1" } },
              graphReturn("ret1"),
            ],
            edges: [{ id: "e1", source: "get1", target: "ret1", sourceHandle: "value", targetHandle: "value" }],
          },
        },
      },
    ]);
    flow.variables = [{ id: "v1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" }];

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    // Module-level declaration (main canvas scope) ...
    expect(formatted).toContain("let counter = 0;");
    // ... and the function's own, textually-nested declaration (function scope) — a
    // legal JS shadowing relationship, not a duplicate-declaration SyntaxError, since the two
    // `let counter` statements live in different lexical scopes.
    expect(formatted).toContain("function getLocalCounter()");
    expect(formatted).toContain("let counter = 100;");
    expect(formatted).toContain("return counter;");
  });

  it("never emits a bare `const variable;` for a no-default const with an unwired Set node (real bug repro)", () => {
    // Matches the exact reported repro: a function-scoped `const` variable with no default
    // value, and a freshly dropped "Set Variable" node not connected to anything. Before the
    // fix, `buildVariableDeclarationStatement` unconditionally emitted `const variable;` for
    // any const with no default — a JS SyntaxError, regardless of whether any Set node existed
    // or was wired at all.
    const graph: FunctionGraph = {
      variables: [{ id: "fv1", name: "variable", keyword: "const", dataType: "string" }],
      nodes: [
        graphEntry("entry1"),
        { id: "set1", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "fv1", literals: { value: "true" } } },
      ],
      edges: [],
    };
    const { code } = emitFunctionGraphBody(graph);
    expect(code).not.toMatch(/const variable;/);
    expect(code).not.toContain("variable");
  });

  it("a const variable with no default is declared+initialized only by its own Set node, once wired into the reachable chain", () => {
    const graph: FunctionGraph = {
      variables: [{ id: "fv1", name: "variable", keyword: "const", dataType: "string" }],
      nodes: [
        graphEntry("entry1"),
        { id: "set1", type: "variable.set", position: { x: 0, y: 0 }, data: { variableId: "fv1", literals: { value: "hi" } } },
      ],
      edges: [{ id: "e1", source: "entry1", target: "set1", sourceHandle: "out", targetHandle: "in" }],
    };
    const { code } = emitFunctionGraphBody(graph);
    expect(code).not.toMatch(/^const variable;/m);
    expect(code).toBe('const variable = ("hi");');
  });
});

describe("logic.function mode: blueprint — real end-to-end compile + spawn + curl", () => {
  it(
    "compiles a blueprint-mode function, spawns the real server, and returns the actual computed value over HTTP",
    async () => {
      const flow: Flow = makeFlow(
        [
          { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
          {
            id: "fn1",
            type: "logic.function",
            position: { x: 0, y: 0 },
            data: {
              name: "double",
              params: "n",
              mode: "blueprint",
              graph: {
                nodes: [graphEntry("entry1"), addNode("add1"), graphReturn("ret1")],
                edges: [
                  { id: "ge1", source: "entry1", target: "add1", sourceHandle: "n", targetHandle: "a" },
                  { id: "ge2", source: "entry1", target: "add1", sourceHandle: "n", targetHandle: "b" },
                  { id: "ge3", source: "add1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
                ],
              },
            },
          },
          { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/double" } },
          { id: "handler", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ result: double(21) });" } },
          { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
        ],
        [
          { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
          { id: "e2", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
          { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
        ],
      );

      const result = validateFlow(flow);
      expect(result.valid).toBe(true);

      const { code } = emitExpress(flow);
      expect(code).toContain("function double(n) {");
      const formatted = await formatCode(code);
      await writeGeneratedFile(GENERATED_PATH, formatted);
      writeFileSync(path.join(path.dirname(GENERATED_PATH), "package.json"), JSON.stringify({ name: "generated-function-graph", private: true }));

      const child = spawn(process.execPath, [GENERATED_PATH], { stdio: ["ignore", "pipe", "pipe"] });

      try {
        await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

        const res = await fetch(`http://localhost:${PORT}/double`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.result).toBe(42); // the real double(21) return value from the compiled blueprint graph
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
