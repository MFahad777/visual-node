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
import { controlFlowSwitchNode } from "../src/nodes/control-flow/switch.node.js";

registerBuiltinNodes();
// controlFlow.switch isn't wired into nodes/index.ts's BUILTIN_NODES yet (that file is owned
// by a parallel workstream for this phase) — register it directly against the shared registry
// here, guarded the same way registerBuiltinNodes() guards itself, so this file stays safe to
// run whether or not nodes/index.ts has already picked it up by the time this runs.
if (!getNodeDefinition(controlFlowSwitchNode.type)) registerNode(controlFlowSwitchNode);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-switch");
// Distinct from other core spawn-test ports: integration.test.ts=3000, function-graph.test.ts=3995,
// function-call-nodes.test.ts=3996, compile-project.test.ts=3997, operator-nodes.test.ts=3994,
// branch-node.test.ts=3992.
const PORT = 3991;

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

/** Builds a `{id, value}` case list where `id` is the stringified index — so pin ids come
 * out as `case-0`, `case-1`, ... exactly as before, while `value` (what the generated
 * `switch` actually compares against) can now be any primitive type. */
function caseList(...values: Array<string | number | boolean>): Array<{ id: string; value: string | number | boolean }> {
  return values.map((value, i) => ({ id: String(i), value }));
}

function switchNode(id: string, cases: Array<{ id: string; value: string | number | boolean }>, data: Record<string, unknown> = {}): FlowNode {
  return { id, type: "controlFlow.switch", position: { x: 0, y: 0 }, data: { cases, ...data } };
}

function customCode(id: string, code: string): FlowNode {
  return { id, type: "handler.customCode", position: { x: 0, y: 0 }, data: { code } };
}

function runGraph(nodes: FlowNode[], edges: FlowEdge[], args: unknown[] = [], paramNames: string[] = []): unknown {
  const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, body);
  return fn(...args);
}

describe("controlFlow.switch — emitFunctionGraphBody unit tests", () => {
  it("emits a real switch statement and executes the matching case", () => {
    const nodes = [
      graphEntry("entry1"),
      switchNode("sw1", caseList(0, 1, 2)),
      customCode("c0", 'return "zero";'),
      customCode("c1", 'return "one";'),
      customCode("c2", 'return "two";'),
      customCode("cd", 'return "other";'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "sw1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "sw1", sourceHandle: "n", targetHandle: "selection" },
      { id: "e3", source: "sw1", target: "c0", sourceHandle: "case-0", targetHandle: "in" },
      { id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" },
      { id: "e5", source: "sw1", target: "c2", sourceHandle: "case-2", targetHandle: "in" },
      { id: "e6", source: "sw1", target: "cd", sourceHandle: "default", targetHandle: "in" },
    ];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).toContain("switch (");
    expect(body).toContain("case 0:");
    expect(body).toContain("case 1:");
    expect(body).toContain("case 2:");
    expect(body).toContain("default:");

    expect(runGraph(nodes, edges, [0], ["n"])).toBe("zero");
    expect(runGraph(nodes, edges, [1], ["n"])).toBe("one");
    expect(runGraph(nodes, edges, [2], ["n"])).toBe("two");
    expect(runGraph(nodes, edges, [99], ["n"])).toBe("other");
  });

  it("an unwired case gets no clause at all, but a wired Default still catches it", () => {
    const nodes = [
      graphEntry("entry1"),
      switchNode("sw1", caseList(0, 1)),
      customCode("c0", 'return "zero";'),
      customCode("cd", 'return "fallback";'),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "entry1", target: "sw1", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "entry1", target: "sw1", sourceHandle: "n", targetHandle: "selection" },
      { id: "e3", source: "sw1", target: "c0", sourceHandle: "case-0", targetHandle: "in" },
      { id: "e4", source: "sw1", target: "cd", sourceHandle: "default", targetHandle: "in" },
    ];
    const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
    expect(body).not.toContain("case 1:");

    expect(runGraph(nodes, edges, [1], ["n"])).toBe("fallback");
  });

  it("both cases and default unwired: exec-chain walker rejects at codegen time", () => {
    const nodes = [graphEntry("entry1"), switchNode("sw1", caseList(0, 1), { literals: { selection: 0 } })];
    const edges: FlowEdge[] = [{ id: "e1", source: "entry1", target: "sw1", sourceHandle: "out", targetHandle: "in" }];
    expect(() => emitFunctionGraphBody({ nodes, edges } as FunctionGraph)).toThrow(/no outgoing connections/);
  });
});

describe("controlFlow.switch — validation", () => {
  function flowWithSwitch(
    cases: Array<{ id: string; value: string | number | boolean }>,
    switchData: Record<string, unknown>,
    extraNodes: FlowNode[],
    extraEdges: FlowEdge[],
  ): Flow {
    return makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        switchNode("sw1", cases, switchData),
        ...extraNodes,
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "sw1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
        ...extraEdges,
      ],
    );
  }

  it("rejects duplicate case values", () => {
    const flow = flowWithSwitch(
      caseList(1, 1, 2),
      { literals: { selection: 1 } },
      [customCode("c1", "res.json({});")],
      [{ id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" }],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate case value 1"))).toBe(true);
  });

  it("does NOT reject case values of different types/shapes — string, number, and boolean are all valid", () => {
    const flow = flowWithSwitch(
      [
        { id: "0", value: "hello" },
        { id: "1", value: 42 },
        { id: "2", value: true },
      ],
      { literals: { selection: '"hello"' } },
      [customCode("c0", "res.json({});"), customCode("c1", "res.json({});"), customCode("c2", "res.json({});")],
      [
        { id: "e4", source: "sw1", target: "c0", sourceHandle: "case-0", targetHandle: "in" },
        { id: "e5", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" },
        { id: "e6", source: "sw1", target: "c2", sourceHandle: "case-2", targetHandle: "in" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  it("rejects a non-primitive case value (object/array)", () => {
    const flow = flowWithSwitch(
      [
        { id: "0", value: 1 },
        // @ts-expect-error deliberately malformed for the test
        { id: "1", value: { nested: true } },
      ],
      { literals: { selection: 1 } },
      [customCode("c1", "res.json({});")],
      [{ id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" }],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("invalid case entry"))).toBe(true);
  });

  it("rejects a stale edge referencing a case that was removed from data.cases", () => {
    const flow = flowWithSwitch(
      caseList(1, 2),
      { literals: { selection: 1 } },
      [customCode("c1", "res.json({});"), customCode("cStale", "res.json({});")],
      [
        { id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" },
        { id: "e5", source: "sw1", target: "cStale", sourceHandle: "case-3", targetHandle: "in" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("references a case that no longer exists"))).toBe(true);
  });

  it("rejects a Switch with both cases and Default completely unwired", () => {
    const flow = flowWithSwitch(caseList(1, 2), { literals: { selection: 1 } }, [], []);
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('no outgoing connections on any case or "Default"'))).toBe(true);
  });

  it("rejects a Switch whose selection is unwired and has no literal", () => {
    const flow = flowWithSwitch(
      caseList(1, 2),
      {},
      [customCode("c1", "res.json({});")],
      [{ id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" }],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('input "selection" is not connected and has no literal value'))).toBe(true);
  });

  it("rejects a Switch whose selection has more than one incoming connection", () => {
    const flow = flowWithSwitch(
      caseList(1, 2),
      {},
      [
        { id: "src1", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "" } },
        { id: "src2", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "" } },
        customCode("c1", "res.json({});"),
      ],
      [
        { id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" },
        { id: "e5", source: "src1", target: "sw1", sourceHandle: "out", targetHandle: "selection" },
        { id: "e6", source: "src2", target: "sw1", sourceHandle: "out", targetHandle: "selection" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('input "selection" has more than one incoming connection'))).toBe(true);
  });

  it("accepts a valid Switch with one case wired and a literal selection", () => {
    const flow = flowWithSwitch(
      caseList(1, 2),
      { literals: { selection: 1 } },
      [customCode("c1", "res.json({});")],
      [{ id: "e4", source: "sw1", target: "c1", sourceHandle: "case-1", targetHandle: "in" }],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(true);
  });

  // Regression: the canvas let you drag two separate wires off the same case (or Default)
  // output with no error, but codegen/exec-chain.ts's walker only ever follows the first
  // edge it finds for a given exec-out handle — the second wire silently never fired.
  it('rejects a Switch whose "Default" output has more than one outgoing connection', () => {
    const flow = flowWithSwitch(
      caseList(1, 2),
      { literals: { selection: 99 } },
      [customCode("d1", "res.json({ path: 1 });"), customCode("d2", "res.json({ path: 2 });")],
      [
        { id: "e4", source: "sw1", target: "d1", sourceHandle: "default", targetHandle: "in" },
        { id: "e5", source: "sw1", target: "d2", sourceHandle: "default", targetHandle: "in" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('more than one outgoing connection from its "default"'))).toBe(true);
  });

  it("rejects a cross-arm value reference: reading one case's Function Call result from a sibling case", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "req1", type: "logic.require", position: { x: 0, y: 0 }, data: { path: "../helpers/math", variableName: "mathHelpers" } },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        switchNode("sw1", caseList(0, 1), { literals: { selection: 0 } }),
        {
          id: "callA",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: { requirePath: "../helpers/math", variableName: "mathHelpers", functionName: "foo", params: "", resultVariable: "x" },
        },
        {
          id: "callB",
          type: "logic.functionCall",
          position: { x: 0, y: 0 },
          data: { requirePath: "../helpers/math", variableName: "mathHelpers", functionName: "bar", params: "n", resultVariable: "y" },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "sw1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "sw1", target: "callA", sourceHandle: "case-0", targetHandle: "in" },
        { id: "e4", source: "sw1", target: "callB", sourceHandle: "case-1", targetHandle: "in" },
        // Cross-arm value edge: callB (case-1) reads callA's (case-0) result.
        { id: "e5", source: "callA", target: "callB", sourceHandle: "result", targetHandle: "param-0" },
        { id: "e6", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("computed only inside Branch/Switch arm"))).toBe(true);
  });
});

describe("controlFlow.switch — real end-to-end compile + spawn + curl", () => {
  function switchRoute(routeId: string, path: string, selectionLiteral: string, wiredCaseId: string | "default"): FlowNode[] {
    const switchId = `${routeId}-sw`;
    const targetId = `${routeId}-target`;
    const sourceHandle = wiredCaseId === "default" ? "default" : `case-${wiredCaseId}`;
    return [
      { id: routeId, type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path } },
      {
        id: switchId,
        type: "controlFlow.switch",
        position: { x: 0, y: 0 },
        data: { cases: caseList(0, 1, 2), literals: { selection: selectionLiteral } },
      },
      { id: targetId, type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { hit: sourceHandle } } },
    ];
  }
  function switchRouteEdges(routeId: string, wiredCaseId: string | "default"): FlowEdge[] {
    const switchId = `${routeId}-sw`;
    const targetId = `${routeId}-target`;
    const sourceHandle = wiredCaseId === "default" ? "default" : `case-${wiredCaseId}`;
    return [
      { id: `${routeId}-e1`, source: "init", target: routeId, sourceHandle: "out", targetHandle: "in" },
      { id: `${routeId}-e2`, source: routeId, target: switchId, sourceHandle: "out", targetHandle: "in" },
      { id: `${routeId}-e3`, source: switchId, target: targetId, sourceHandle, targetHandle: "in" },
    ];
  }

  // `selectionLiteral` is raw JS text (matching every other literal in this codebase) — "0"
  // matches the number case, `"\"hello\""` (a string containing literal quote characters)
  // matches a string-valued case, proving Selection really does accept any type end-to-end,
  // not just integers.
  function serverFlow(port: number): Flow {
    return makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        ...switchRoute("r0", "/r0", "0", "0"),
        ...switchRoute("r1", "/r1", "1", "1"),
        ...switchRoute("r2", "/r2", "2", "2"),
        ...switchRoute("rdefault", "/rdefault", "99", "default"),
        {
          id: "rstring-sw",
          type: "controlFlow.switch",
          position: { x: 0, y: 0 },
          data: { cases: [{ id: "s", value: "hello" }], literals: { selection: '"hello"' } },
        },
        { id: "rstring", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/rstring" } },
        { id: "rstring-target", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { hit: "case-s" } } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
      ],
      [
        ...switchRouteEdges("r0", "0"),
        ...switchRouteEdges("r1", "1"),
        ...switchRouteEdges("r2", "2"),
        ...switchRouteEdges("rdefault", "default"),
        { id: "e-rstring1", source: "init", target: "rstring", sourceHandle: "out", targetHandle: "in" },
        { id: "e-rstring2", source: "rstring", target: "rstring-sw", sourceHandle: "out", targetHandle: "in" },
        { id: "e-rstring3", source: "rstring-sw", target: "rstring-target", sourceHandle: "case-s", targetHandle: "in" },
        { id: "e-listen", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
  }

  it(
    "spawns a real server with 4 independent Switch instances: a multi-case truth table plus a Default fallback, all over real HTTP",
    async () => {
      const flow = serverFlow(PORT);
      const result = validateFlow(flow);
      expect(result.valid).toBe(true);

      const { code } = emitExpress(flow);
      const formatted = await formatCode(code);
      const generatedPath = path.join(GENERATED_DIR, "server.js");
      await writeGeneratedFile(generatedPath, formatted);
      writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "generated-switch", private: true }));

      const child = spawn(process.execPath, [generatedPath], { stdio: ["ignore", "pipe", "pipe"] });

      try {
        await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

        const res0 = await fetch(`http://localhost:${PORT}/r0`);
        expect(await res0.json()).toEqual({ hit: "case-0" });

        const res1 = await fetch(`http://localhost:${PORT}/r1`);
        expect(await res1.json()).toEqual({ hit: "case-1" });

        const res2 = await fetch(`http://localhost:${PORT}/r2`);
        expect(await res2.json()).toEqual({ hit: "case-2" });

        // selection literal 99 matches none of [0, 1, 2] -> must fall through to Default.
        const resDefault = await fetch(`http://localhost:${PORT}/rdefault`);
        expect(await resDefault.json()).toEqual({ hit: "default" });

        // Selection accepts any type, not just integers — a string-valued case, matched by a
        // quoted string literal, over real HTTP.
        const resString = await fetch(`http://localhost:${PORT}/rstring`);
        expect(await resString.json()).toEqual({ hit: "case-s" });
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
