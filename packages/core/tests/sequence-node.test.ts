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
import { controlFlowSequenceNode } from "../src/nodes/control-flow/sequence.node.js";

registerBuiltinNodes();
if (!getNodeDefinition(controlFlowSequenceNode.type)) registerNode(controlFlowSequenceNode);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-sequence");
// Distinct from other core spawn-test ports (see branch-node.test.ts's port comment for the
// full map) — 3993 is free.
const PORT = 3993;

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function sequenceNode(id: string, pinIds: string[] = []): FlowNode {
  return { id, type: "controlFlow.sequence", position: { x: 0, y: 0 }, data: { pins: pinIds.map((p) => ({ id: p })) } };
}

function branchNode(id: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type: "controlFlow.branch", position: { x: 0, y: 0 }, data };
}

function graphReturn(id: string, literal: string): FlowNode {
  return { id, type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: literal } } };
}

function runGraph(nodes: FlowNode[], edges: FlowEdge[], args: unknown[] = [], paramNames: string[] = []): unknown {
  const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, body);
  return fn(...args);
}

describe("controlFlow.sequence — emitFunctionGraphBody unit tests", () => {
  function pushNode(id: string, arrayParam: string, value: string): FlowNode {
    return { id, type: "array.push", position: { x: 0, y: 0 }, data: { literals: { value } } };
  }

  it("fires every wired pin unconditionally, in left-to-right pin order", () => {
    const nodes = [graphEntry("entry1"), sequenceNode("seq1", ["p1", "p2"]), pushNode("a", "order", "'A'"), pushNode("b", "order", "'B'"), pushNode("c", "order", "'C'")];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "seq1", sourceHandle: "out", targetHandle: "in" },
      // Wire pins out of declaration order in the fixture, to prove pin order (not fixture
      // array order or node-id order) governs emission.
      { id: "e2", source: "seq1", target: "c", sourceHandle: "then-p2", targetHandle: "in" },
      { id: "e3", source: "seq1", target: "a", sourceHandle: "then-0", targetHandle: "in" },
      { id: "e4", source: "seq1", target: "b", sourceHandle: "then-p1", targetHandle: "in" },
      { id: "e5", source: "entry1", target: "a", sourceHandle: "order", targetHandle: "array" },
      { id: "e6", source: "entry1", target: "b", sourceHandle: "order", targetHandle: "array" },
      { id: "e7", source: "entry1", target: "c", sourceHandle: "order", targetHandle: "array" },
    ];

    const order: string[] = [];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    // eslint-disable-next-line no-new-func
    new Function("order", body)(order);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("only some pins wired: unwired pin contributes nothing (no empty block)", () => {
    const nodes = [graphEntry("entry1"), sequenceNode("seq1", ["p1", "p2"]), pushNode("a", "order", "'A'"), pushNode("c", "order", "'C'")];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "seq1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "seq1", target: "a", sourceHandle: "then-0", targetHandle: "in" },
      { id: "e3", source: "seq1", target: "c", sourceHandle: "then-p2", targetHandle: "in" },
      { id: "e4", source: "entry1", target: "a", sourceHandle: "order", targetHandle: "array" },
      { id: "e5", source: "entry1", target: "c", sourceHandle: "order", targetHandle: "array" },
    ];
    const order: string[] = [];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    // eslint-disable-next-line no-new-func
    new Function("order", body)(order);
    expect(order).toEqual(["A", "C"]);
  });

  it("the getDiscount example: 5 pins, each a guard clause, executes the first matching guard", () => {
    const nodes: FlowNode[] = [
      graphEntry("entry1"),
      sequenceNode("seq1", ["p1", "p2", "p3", "p4"]),
      branchNode("bActive"),
      graphReturn("retInactive", "0"),
      branchNode("bEmployee"),
      graphReturn("retEmployee", "30"),
      branchNode("bPremium"),
      graphReturn("retPremium", "20"),
      branchNode("bSpent"),
      graphReturn("retSpent", "10"),
      graphReturn("retDefault", "5"),
    ];
    const edges: FlowEdge[] = [
      { id: "e0", source: "entry1", target: "seq1", sourceHandle: "out", targetHandle: "in" },

      { id: "e1", source: "seq1", target: "bActive", sourceHandle: "then-0", targetHandle: "in" },
      { id: "e1c", source: "entry1", target: "bActive", sourceHandle: "isActive", targetHandle: "condition" },
      { id: "e1r", source: "bActive", target: "retInactive", sourceHandle: "false", targetHandle: "in" },

      { id: "e2", source: "seq1", target: "bEmployee", sourceHandle: "then-p1", targetHandle: "in" },
      { id: "e2c", source: "entry1", target: "bEmployee", sourceHandle: "isEmployee", targetHandle: "condition" },
      { id: "e2r", source: "bEmployee", target: "retEmployee", sourceHandle: "true", targetHandle: "in" },

      { id: "e3", source: "seq1", target: "bPremium", sourceHandle: "then-p2", targetHandle: "in" },
      { id: "e3c", source: "entry1", target: "bPremium", sourceHandle: "isPremium", targetHandle: "condition" },
      { id: "e3r", source: "bPremium", target: "retPremium", sourceHandle: "true", targetHandle: "in" },

      { id: "e4", source: "seq1", target: "bSpent", sourceHandle: "then-p3", targetHandle: "in" },
      { id: "e4c", source: "entry1", target: "bSpent", sourceHandle: "spentEnough", targetHandle: "condition" },
      { id: "e4r", source: "bSpent", target: "retSpent", sourceHandle: "true", targetHandle: "in" },

      { id: "e5", source: "seq1", target: "retDefault", sourceHandle: "then-p4", targetHandle: "in" },
    ];
    const paramNames = ["isActive", "isEmployee", "isPremium", "spentEnough"];
    expect(runGraph(nodes, edges, [false, false, false, false], paramNames)).toBe(0);
    expect(runGraph(nodes, edges, [true, true, false, false], paramNames)).toBe(30);
    expect(runGraph(nodes, edges, [true, false, true, false], paramNames)).toBe(20);
    expect(runGraph(nodes, edges, [true, false, false, true], paramNames)).toBe(10);
    expect(runGraph(nodes, edges, [true, false, false, false], paramNames)).toBe(5);
  });

  it("zero pins wired: exec-chain walker rejects at codegen time", () => {
    const nodes = [graphEntry("entry1"), sequenceNode("seq1")];
    const edges: FlowEdge[] = [{ id: "e1", source: "entry1", target: "seq1", sourceHandle: "out", targetHandle: "in" }];
    expect(() => emitFunctionGraphBody({ nodes, edges } as FunctionGraph)).toThrow(/no outgoing connections/);
  });
});

describe("controlFlow.sequence — validation", () => {
  function flowWithSequence(pins: string[], extraNodes: FlowNode[], extraEdges: FlowEdge[]): Flow {
    return makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        {
          id: "handlerFn",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "sequenceTestHandler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                sequenceNode("seq1", pins),
                ...extraNodes,
              ],
              edges: [
                { id: "ge1", source: "entry", target: "seq1", sourceHandle: "out", targetHandle: "in" },
                ...extraEdges,
              ],
            },
          },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "handlerFn", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
  }

  it("rejects a Sequence with no pin wired", () => {
    const result = validateFlow(flowWithSequence(["p1"], [], []));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("would do nothing"))).toBe(true);
  });

  it("accepts a Sequence with only then-0 wired", () => {
    const result = validateFlow(
      flowWithSequence(["p1"], [{ id: "a", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } }], [
        { id: "e4", source: "seq1", target: "a", sourceHandle: "then-0", targetHandle: "in" },
      ]),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a stale wire referencing a pin id that was removed", () => {
    const result = validateFlow(
      flowWithSequence(["p1"], [{ id: "a", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } }], [
        { id: "e4", source: "seq1", target: "a", sourceHandle: "then-p2", targetHandle: "in" },
      ]),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("references a pin that no longer exists"))).toBe(true);
  });

  it("accepts a freshly-created Sequence whose data.pins was never initialized (only then-0 wired)", () => {
    const flow = flowWithSequence([], [{ id: "a", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } }], [
      { id: "e4", source: "seq1", target: "a", sourceHandle: "then-0", targetHandle: "in" },
    ]);
    const handlerFn = flow.nodes.find((n) => n.id === "handlerFn")!;
    const graphData = (handlerFn.data as any).graph;
    const seqNode = graphData.nodes.find((n: any) => n.id === "seq1")!;
    seqNode.data = {};
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate pin ids in data.pins", () => {
    const flow = flowWithSequence([], [{ id: "a", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } }], [
      { id: "e4", source: "seq1", target: "a", sourceHandle: "then-0", targetHandle: "in" },
    ]);
    const handlerFn = flow.nodes.find((n) => n.id === "handlerFn")!;
    const graphData = (handlerFn.data as any).graph;
    const seqNode = graphData.nodes.find((n: any) => n.id === "seq1")!;
    seqNode.data = { pins: [{ id: "dup" }, { id: "dup" }] };
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate pin id"))).toBe(true);
  });
});

describe("controlFlow.sequence — real end-to-end compile + spawn + curl", () => {
  function serverFlow(port: number): Flow {
    return makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/order" } },
        {
          id: "handlerFn",
          type: "logic.handlerFunction",
          position: { x: 0, y: 0 },
          data: {
            name: "sequenceHandler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                sequenceNode("seq1", ["p1"]),
                { id: "s0", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: { expression: '"SEQUENCE_ORDER: first"' } },
                { id: "s1", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: { expression: '"SEQUENCE_ORDER: second"' } },
                { id: "s2", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } },
              ],
              edges: [
                { id: "ge1", source: "entry", target: "seq1", sourceHandle: "out", targetHandle: "in" },
                { id: "ge2", source: "seq1", target: "s0", sourceHandle: "then-0", targetHandle: "in" },
                { id: "ge3", source: "seq1", target: "s1", sourceHandle: "then-p1", targetHandle: "in" },
                { id: "ge4", source: "s1", target: "s2", sourceHandle: "out", targetHandle: "in" },
              ],
            },
          },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "handlerFn", sourceHandle: "out", targetHandle: "in" },
        { id: "e-listen", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
  }

  it(
    "spawns a real server whose Sequence node runs both pins in order before the route responds",
    async () => {
      const flow = serverFlow(PORT);
      const result = validateFlow(flow);
      expect(result.valid).toBe(true);

      const { code } = emitExpress(flow);
      const formatted = await formatCode(code);
      const generatedPath = path.join(GENERATED_DIR, "server.js");
      await writeGeneratedFile(generatedPath, formatted);
      writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "generated-sequence", private: true }));

      const child = spawn(process.execPath, [generatedPath], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      try {
        await waitForOutput(child, `Server running on port ${PORT}`, 10_000);
        const res = await fetch(`http://localhost:${PORT}/order`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        // Real observable proof both Sequence arms actually ran, in pin order, inside a real
        // spawned process — then-0's console.log line appears before then-p1's.
        const firstIdx = stdout.indexOf("SEQUENCE_ORDER: first");
        const secondIdx = stdout.indexOf("SEQUENCE_ORDER: second");
        expect(firstIdx).toBeGreaterThan(-1);
        expect(secondIdx).toBeGreaterThan(firstIdx);
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
  });
}
