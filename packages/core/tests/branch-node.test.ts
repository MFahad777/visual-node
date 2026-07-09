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
import { controlFlowBranchNode } from "../src/nodes/control-flow/branch.node.js";

registerBuiltinNodes();
// controlFlow.branch isn't wired into nodes/index.ts's BUILTIN_NODES yet (that file is owned
// by a parallel workstream for this phase) — register it directly against the shared registry
// here, guarded the same way registerBuiltinNodes() guards itself, so this file stays safe to
// run whether or not nodes/index.ts has already picked it up by the time this runs.
if (!getNodeDefinition(controlFlowBranchNode.type)) registerNode(controlFlowBranchNode);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-branch");
// Distinct from other core spawn-test ports: integration.test.ts=3000, function-graph.test.ts=3995,
// function-call-nodes.test.ts=3996, compile-project.test.ts=3997, operator-nodes.test.ts=3994,
// switch-node.test.ts=3991.
const PORT = 3992;

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function branchNode(id: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type: "controlFlow.branch", position: { x: 0, y: 0 }, data };
}

function multiplyNode(id: string, literals: Record<string, string> = {}): FlowNode {
  return { id, type: "operators.multiply", position: { x: 0, y: 0 }, data: { literals } };
}

function runGraph(nodes: FlowNode[], edges: FlowEdge[], args: unknown[] = [], paramNames: string[] = []): unknown {
  const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, body);
  return fn(...args);
}

describe("controlFlow.branch — emitFunctionGraphBody unit tests", () => {
  it("both arms wired: emits if/else and executes the matching arm", () => {
    const nodes = [
      graphEntry("entry1"),
      branchNode("b1"),
      { id: "t1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "'T'" } } },
      { id: "f1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "'F'" } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "b1", sourceHandle: "flag", targetHandle: "condition" },
      { id: "e3", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
      { id: "e4", source: "b1", target: "f1", sourceHandle: "false", targetHandle: "in" },
    ];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("if (");
    expect(body).toContain("else {");

    expect(runGraph(nodes, edges, [true], ["flag"])).toBe("T");
    expect(runGraph(nodes, edges, [false], ["flag"])).toBe("F");
  });

  it("a logic.graphReturn node wired directly into a Branch arm early-returns in place (no Custom Code workaround needed)", () => {
    const nodes = [
      graphEntry("entry1"),
      branchNode("b1"),
      { id: "retT", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "'T'" } } },
      { id: "retF", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "'F'" } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "b1", sourceHandle: "flag", targetHandle: "condition" },
      { id: "e3", source: "b1", target: "retT", sourceHandle: "true", targetHandle: "in" },
      { id: "e4", source: "b1", target: "retF", sourceHandle: "false", targetHandle: "in" },
    ];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("if (");
    expect(body).toContain("else {");
    expect(runGraph(nodes, edges, [true], ["flag"])).toBe("T");
    expect(runGraph(nodes, edges, [false], ["flag"])).toBe("F");
  });

  it("true-only wired: no else clause; false condition falls through to no return", () => {
    const nodes = [
      graphEntry("entry1"),
      branchNode("b1"),
      { id: "t1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "'T'" } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "b1", sourceHandle: "flag", targetHandle: "condition" },
      { id: "e3", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
    ];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).not.toContain("else");

    expect(runGraph(nodes, edges, [true], ["flag"])).toBe("T");
    expect(runGraph(nodes, edges, [false], ["flag"])).toBeUndefined();
  });

  it("false-only wired: inverts the condition (if (!(...))) instead of an empty positive branch", () => {
    const nodes = [
      graphEntry("entry1"),
      branchNode("b1"),
      { id: "f1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "'F'" } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "b1", sourceHandle: "flag", targetHandle: "condition" },
      { id: "e3", source: "b1", target: "f1", sourceHandle: "false", targetHandle: "in" },
    ];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("if (!(");

    expect(runGraph(nodes, edges, [false], ["flag"])).toBe("F");
    expect(runGraph(nodes, edges, [true], ["flag"])).toBeUndefined();
  });

  it("both arms unwired: exec-chain walker rejects at codegen time", () => {
    const nodes = [graphEntry("entry1"), branchNode("b1", { literals: { condition: true } })];
    const edges: FlowEdge[] = [{ id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" }];
    expect(() => emitFunctionGraphBody({ nodes, edges } as FunctionGraph)).toThrow(/no outgoing connections/);
  });

  it("nested Branch inside a Branch's True arm compiles to nested if/else and executes all combinations", () => {
    const nodes = [
      graphEntry("entry1"),
      branchNode("outer"),
      branchNode("inner"),
      { id: "tt", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: '"AA"' } } },
      { id: "tf", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: '"AB"' } } },
      { id: "f", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: '"B"' } } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "outer", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "outer", sourceHandle: "a", targetHandle: "condition" },
      { id: "e3", source: "outer", target: "inner", sourceHandle: "true", targetHandle: "in" },
      { id: "e4", source: "entry1", target: "inner", sourceHandle: "b", targetHandle: "condition" },
      { id: "e5", source: "inner", target: "tt", sourceHandle: "true", targetHandle: "in" },
      { id: "e6", source: "inner", target: "tf", sourceHandle: "false", targetHandle: "in" },
      { id: "e7", source: "outer", target: "f", sourceHandle: "false", targetHandle: "in" },
    ];

    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    // Two nested `if` blocks (outer + inner), proving Branch-inside-a-Branch-arm actually nests
    // rather than flattening or clobbering the outer scope.
    expect((body.match(/if \(/g) ?? []).length).toBe(2);

    expect(runGraph(nodes, edges, [true, true], ["a", "b"])).toBe("AA");
    expect(runGraph(nodes, edges, [true, false], ["a", "b"])).toBe("AB");
    expect(runGraph(nodes, edges, [false, true], ["a", "b"])).toBe("B");
    expect(runGraph(nodes, edges, [false, false], ["a", "b"])).toBe("B");
  });

  it("a shared upstream value node wired into BOTH arms' consumers is safely re-hoisted per arm and behaves correctly", () => {
    // mul1 (a pure value node with no exec pins) is referenced from a real operator node in
    // both the True and False arms — exactly the "value node referenced from both arms"
    // pattern exec-chain.ts's hoistValueDeps exists to support (each arm re-hoists its own
    // independent copy; no leakage between the two).
    const nodes = [
      graphEntry("entry1"),
      multiplyNode("mul1", { b: "10" }),
      branchNode("b1"),
      { id: "add1", type: "operators.add", position: { x: 0, y: 0 }, data: { literals: { b: "1" } } },
      { id: "sub1", type: "operators.subtract", position: { x: 0, y: 0 }, data: { literals: { b: "1" } } },
      { id: "t1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} },
      { id: "f1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "b1", sourceHandle: "flag", targetHandle: "condition" },
      { id: "e3", source: "entry1", target: "mul1", sourceHandle: "n", targetHandle: "a" },
      { id: "e4", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
      { id: "e5", source: "b1", target: "f1", sourceHandle: "false", targetHandle: "in" },
      { id: "e6", source: "mul1", target: "add1", sourceHandle: "result", targetHandle: "a" },
      { id: "e7", source: "mul1", target: "sub1", sourceHandle: "result", targetHandle: "a" },
      { id: "e8", source: "add1", target: "t1", sourceHandle: "result", targetHandle: "value" },
      { id: "e9", source: "sub1", target: "f1", sourceHandle: "result", targetHandle: "value" },
    ];

    expect(runGraph(nodes, edges, [true, 5], ["flag", "n"])).toBe(51); // (5*10) + 1
    expect(runGraph(nodes, edges, [false, 5], ["flag", "n"])).toBe(49); // (5*10) - 1

    // Also confirm validateFlow (wrapping this exact graph in a real blueprint Function node)
    // does NOT flag this as an illegal cross-arm reference — it's the explicitly-supported
    // "safely re-hoisted per arm" pattern, not the "reads a value owned by a sibling arm"
    // pattern the cross-arm check exists to reject.
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: { name: "pick", params: "flag, n", mode: "blueprint", graph: { nodes, edges } },
      },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });
});

describe("controlFlow.branch — validation", () => {
  // Route can only attach a Handler Function (Phase 24) — the Branch under test lives inside
  // the Handler Function's own blueprint graph instead of directly off Route.
  function flowWithBranch(branchData: Record<string, unknown>, extraNodes: FlowNode[], extraEdges: FlowEdge[]): Flow {
    return makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "hf1",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                branchNode("b1", branchData),
                ...extraNodes,
              ],
              edges: [
                { id: "ge1", source: "entry1", target: "b1", sourceHandle: "out", targetHandle: "in" },
                ...extraEdges,
              ],
            },
          },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "hf1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
  }

  it("rejects a Branch with neither True nor False wired", () => {
    const flow = flowWithBranch({ literals: { condition: true } }, [], []);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no outgoing connection on either"))).toBe(true);
  });

  it("accepts a Branch with only True wired", () => {
    const flow = flowWithBranch({ literals: { condition: true } }, [{ id: "t1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } }], [
      { id: "e4", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  it("rejects a Branch whose condition is unwired and has no literal", () => {
    const flow = flowWithBranch({}, [{ id: "t1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } }], [
      { id: "e4", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
    ]);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('input "condition" is not connected and has no literal value'))).toBe(true);
  });

  it("rejects a Branch whose condition has more than one incoming connection", () => {
    const flow = flowWithBranch(
      {},
      [
        { id: "src1", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: {} },
        { id: "src2", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: {} },
        { id: "t1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } },
      ],
      [
        { id: "e4", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
        { id: "e5", source: "src1", target: "b1", sourceHandle: "out", targetHandle: "condition" },
        { id: "e6", source: "src2", target: "b1", sourceHandle: "out", targetHandle: "condition" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('input "condition" has more than one incoming connection'))).toBe(true);
  });

  // Regression: the canvas let you drag two separate wires off Branch's "False" output with
  // no error, but codegen/exec-chain.ts's walker only ever follows the first edge it finds
  // for a given exec-out handle — the second wire silently never fired.
  it('rejects a Branch whose "False" output has more than one outgoing connection', () => {
    const flow = flowWithBranch(
      { literals: { condition: true } },
      [
        { id: "f1", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { path: 1 } } },
        { id: "f2", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { path: 2 } } },
      ],
      [
        { id: "e4", source: "b1", target: "f1", sourceHandle: "false", targetHandle: "in" },
        { id: "e5", source: "b1", target: "f2", sourceHandle: "false", targetHandle: "in" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('more than one outgoing connection from its "false"'))).toBe(true);
  });
});

describe("controlFlow.branch — real end-to-end compile + spawn + curl", () => {
  function serverFlow(port: number): Flow {
    function route(id: string, path: string, conditionLiteral: boolean, branchId: string, trueId: string, falseId: string): FlowNode[] {
      const handlerFnId = `${id}-handler`;
      return [
        { id, type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path } },
        {
          id: handlerFnId,
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: `branchHandler_${id}`,
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                { id: branchId, type: "controlFlow.branch", position: { x: 0, y: 0 }, data: { literals: { condition: conditionLiteral } } },
                { id: trueId, type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { from: `${branchId}-true` } } },
                { id: falseId, type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { from: `${branchId}-false` } } },
              ],
              edges: [
                { id: "e-entry", source: "entry", target: branchId, sourceHandle: "out", targetHandle: "in" },
                { id: "e-true", source: branchId, target: trueId, sourceHandle: "true", targetHandle: "in" },
                { id: "e-false", source: branchId, target: falseId, sourceHandle: "false", targetHandle: "in" },
              ],
            },
          },
        },
      ];
    }
    function routeEdges(routeId: string): FlowEdge[] {
      const handlerFnId = `${routeId}-handler`;
      return [
        { id: `${routeId}-e1`, source: "init", target: routeId, sourceHandle: "out", targetHandle: "in" },
        { id: `${routeId}-e2`, source: routeId, target: handlerFnId, sourceHandle: "out", targetHandle: "in" },
      ];
    }

    return makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        ...route("routeA", "/a", true, "branchA", "trueA", "falseA"),
        ...route("routeB", "/b", false, "branchB", "trueB", "falseB"),
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
      ],
      [
        ...routeEdges("routeA"),
        ...routeEdges("routeB"),
        { id: "e-listen", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
  }

  it(
    "spawns a real server with two independent Branch instances and returns the correct if/else outcome over HTTP for each",
    async () => {
      const flow = serverFlow(PORT);
      const result = validateFlow(flow);
      expect(result.valid).toBe(true);

      const { code } = emitExpress(flow);
      const formatted = await formatCode(code);
      const generatedPath = path.join(GENERATED_DIR, "server.js");
      await writeGeneratedFile(generatedPath, formatted);
      writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "generated-branch", private: true }));

      const child = spawn(process.execPath, [generatedPath], { stdio: ["ignore", "pipe", "pipe"] });

      try {
        await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

        // branchA's condition literal is `true` -> the True arm's Send JSON must answer.
        const resA = await fetch(`http://localhost:${PORT}/a`);
        expect(resA.status).toBe(200);
        expect(await resA.json()).toEqual({ from: "branchA-true" });

        // branchB's condition literal is `false` -> the False arm's Send JSON must answer —
        // proving the emitted `if`/`else` actually took the right side, not just that SOME
        // response came back.
        const resB = await fetch(`http://localhost:${PORT}/b`);
        expect(resB.status).toBe(200);
        expect(await resB.json()).toEqual({ from: "branchB-false" });
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
