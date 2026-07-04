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

import { addNode } from "../src/nodes/operators/add.node.js";
import { subtractNode } from "../src/nodes/operators/subtract.node.js";
import { multiplyNode } from "../src/nodes/operators/multiply.node.js";
import { divideNode } from "../src/nodes/operators/divide.node.js";
import { moduloNode } from "../src/nodes/operators/modulo.node.js";
import { equalNode } from "../src/nodes/operators/equal.node.js";
import { notEqualNode } from "../src/nodes/operators/not-equal.node.js";
import { greaterThanNode } from "../src/nodes/operators/greater-than.node.js";
import { lessThanNode } from "../src/nodes/operators/less-than.node.js";
import { greaterOrEqualNode } from "../src/nodes/operators/greater-or-equal.node.js";
import { lessOrEqualNode } from "../src/nodes/operators/less-or-equal.node.js";
import { andNode } from "../src/nodes/operators/and.node.js";
import { nandNode } from "../src/nodes/operators/nand.node.js";
import { orNode } from "../src/nodes/operators/or.node.js";
import { norNode } from "../src/nodes/operators/nor.node.js";
import { xorNode } from "../src/nodes/operators/xor.node.js";
import { notNode } from "../src/nodes/operators/not.node.js";

registerBuiltinNodes();
// The 17 operator node types aren't wired into nodes/index.ts's BUILTIN_NODES yet (that file
// is owned by a parallel workstream for this phase) — register them directly against the
// shared registry here, guarded the same way registerBuiltinNodes() guards itself, so this
// stays safe to run whether or not nodes/index.ts has already picked these up by the time this
// file runs.
for (const def of [
  addNode,
  subtractNode,
  multiplyNode,
  divideNode,
  moduloNode,
  equalNode,
  notEqualNode,
  greaterThanNode,
  lessThanNode,
  greaterOrEqualNode,
  lessOrEqualNode,
  andNode,
  nandNode,
  orNode,
  norNode,
  xorNode,
  notNode,
]) {
  if (!getNodeDefinition(def.type)) registerNode(def);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = path.join(__dirname, "fixtures", "generated-operator-nodes", "server.js");
// Distinct from other core spawn-test ports: integration.test.ts=3000, function-graph.test.ts=3995,
// function-call-nodes.test.ts=3996, compile-project.test.ts=3997.
const PORT = 3994;

afterAll(() => {
  rmSync(path.join(__dirname, "fixtures", "generated-operator-nodes"), { recursive: true, force: true });
});

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function graphReturn(id: string): FlowNode {
  return { id, type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} };
}

function opNode(id: string, type: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function runGraph(nodes: FlowNode[], edges: FlowEdge[], args: unknown[] = [], paramNames: string[] = []): unknown {
  const { code: body } = emitFunctionGraphBody({ nodes, edges } as FunctionGraph);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, body);
  return fn(...args);
}

/** Wires an entry's "x"/"y" param outputs into a binary operator's "a"/"b" inputs, and the
 * operator's "result" into Return's "value" — then executes the compiled body for real. */
function runBinaryWired(type: string, x: unknown, y: unknown): unknown {
  const nodes = [graphEntry("entry1"), opNode("op1", type), graphReturn("ret1")];
  const edges: FlowEdge[] = [
    { id: "e1", source: "entry1", target: "op1", sourceHandle: "x", targetHandle: "a" },
    { id: "e2", source: "entry1", target: "op1", sourceHandle: "y", targetHandle: "b" },
    { id: "e3", source: "op1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
  ];
  return runGraph(nodes, edges, [x, y], ["x", "y"]);
}

/** Both "a" and "b" come from `data.literals` — no wiring at all. */
function runBinaryLiteral(type: string, a: unknown, b: unknown): unknown {
  const nodes = [opNode("op1", type, { literals: { a, b } }), graphReturn("ret1")];
  const edges: FlowEdge[] = [{ id: "e1", source: "op1", target: "ret1", sourceHandle: "result", targetHandle: "value" }];
  return runGraph(nodes, edges);
}

/** A variadic boolean node ("a"/"b" plus optional `extraInputs`), all operands from `data.literals`. */
function runBooleanGraph(type: string, literals: Record<string, unknown>, extraInputs: string[] = []): unknown {
  const nodes = [opNode("op1", type, { literals, extraInputs }), graphReturn("ret1")];
  const edges: FlowEdge[] = [{ id: "e1", source: "op1", target: "ret1", sourceHandle: "result", targetHandle: "value" }];
  return runGraph(nodes, edges);
}

function truthTableLiterals(combo: boolean[]): { literals: Record<string, unknown>; extraInputs: string[] } {
  const literals: Record<string, unknown> = { a: combo[0], b: combo[1] };
  const extraInputs = combo.slice(2).map((_, i) => `extra-${i}`);
  extraInputs.forEach((id, i) => {
    literals[id] = combo[i + 2];
  });
  return { literals, extraInputs };
}

function allBoolCombos(n: number): boolean[][] {
  const combos: boolean[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    combos.push(Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i))));
  }
  return combos;
}

describe("arithmetic operators", () => {
  const CASES: Array<{ type: string; op: (a: number, b: number) => number }> = [
    { type: "operators.add", op: (a, b) => a + b },
    { type: "operators.subtract", op: (a, b) => a - b },
    { type: "operators.multiply", op: (a, b) => a * b },
    { type: "operators.divide", op: (a, b) => a / b },
    { type: "operators.modulo", op: (a, b) => a % b },
  ];

  for (const { type, op } of CASES) {
    it(`${type}: wired inputs compute the real value`, () => {
      expect(runBinaryWired(type, 17, 5)).toBe(op(17, 5));
    });

    it(`${type}: literal inputs compute the real value`, () => {
      expect(runBinaryLiteral(type, 17, 5)).toBe(op(17, 5));
    });
  }
});

describe("comparison operators", () => {
  const CASES: Array<{ type: string; op: (a: number, b: number) => boolean }> = [
    { type: "operators.equal", op: (a, b) => a === b },
    { type: "operators.notEqual", op: (a, b) => a !== b },
    { type: "operators.greaterThan", op: (a, b) => a > b },
    { type: "operators.lessThan", op: (a, b) => a < b },
    { type: "operators.greaterOrEqual", op: (a, b) => a >= b },
    { type: "operators.lessOrEqual", op: (a, b) => a <= b },
  ];

  for (const { type, op } of CASES) {
    for (const [a, b] of [
      [3, 5],
      [5, 5],
      [5, 3],
    ] as const) {
      it(`${type}: ${a} vs ${b}`, () => {
        expect(runBinaryWired(type, a, b)).toBe(op(a, b));
      });
    }
  }
});

describe("boolean variadic operators — truth tables", () => {
  const EXPECTATIONS: Record<string, (operands: boolean[]) => boolean> = {
    "operators.and": (ops) => ops.every(Boolean),
    "operators.nand": (ops) => !ops.every(Boolean),
    "operators.or": (ops) => ops.some(Boolean),
    "operators.nor": (ops) => !ops.some(Boolean),
    // Odd-parity N-ary XOR: true iff an odd number of operands are true.
    "operators.xor": (ops) => ops.filter(Boolean).length % 2 === 1,
  };

  for (const [type, expected] of Object.entries(EXPECTATIONS)) {
    describe(type, () => {
      for (const n of [2, 3]) {
        for (const combo of allBoolCombos(n)) {
          it(`${n} operands: [${combo.join(", ")}] -> ${expected(combo)}`, () => {
            const { literals, extraInputs } = truthTableLiterals(combo);
            const result = runBooleanGraph(type, literals, extraInputs);
            expect(result).toBe(expected(combo));
            expect(typeof result).toBe("boolean");
          });
        }
      }
    });
  }

  it("AND coerces non-boolean truthy operands (number, string) to a real boolean, not passthrough", () => {
    // `a: 1` (truthy number) and `b: '"nonempty"'` (a JS string-literal source, truthy) — neither
    // is a boolean, but Boolean(...)-coercion inside the emitted code must still produce `true`.
    const result = runBooleanGraph("operators.and", { a: 1, b: '"nonempty"' });
    expect(result).toBe(true);
    expect(typeof result).toBe("boolean");
  });

  it("AND with a falsy first operand (0) still coerces to boolean false, not the falsy value itself", () => {
    const result = runBooleanGraph("operators.and", { a: 0, b: '"nonempty"' });
    expect(result).toBe(false);
    expect(typeof result).toBe("boolean");
  });
});

describe("extraInputs with a non-contiguous gap", () => {
  it("resolves extra-0 and extra-3 correctly even though extra-1/extra-2 were never minted", () => {
    const literals = { a: true, b: true, "extra-0": true, "extra-3": true };
    expect(runBooleanGraph("operators.and", literals, ["extra-0", "extra-3"])).toBe(true);
  });

  it("a single false among the 4 gapped-id operands makes AND false", () => {
    const literals = { a: true, b: true, "extra-0": true, "extra-3": false };
    expect(runBooleanGraph("operators.and", literals, ["extra-0", "extra-3"])).toBe(false);
  });

  it("XOR over 4 gapped-id operands with even parity (two trues) is false", () => {
    const literals = { a: true, b: true, "extra-0": false, "extra-3": false };
    expect(runBooleanGraph("operators.xor", literals, ["extra-0", "extra-3"])).toBe(false);
  });

  it("XOR over 4 gapped-id operands with odd parity (three trues) is true", () => {
    const literals = { a: true, b: true, "extra-0": true, "extra-3": false };
    expect(runBooleanGraph("operators.xor", literals, ["extra-0", "extra-3"])).toBe(true);
  });
});

describe("NOT node", () => {
  it("negates true -> false", () => {
    expect(runBooleanGraph("operators.not", { a: true })).toBe(false);
  });

  it("negates false -> true", () => {
    expect(runBooleanGraph("operators.not", { a: false })).toBe(true);
  });
});

describe("literal fallback and default-literal behavior", () => {
  it("an unwired pin with a data.literals entry uses that value", () => {
    expect(runBinaryLiteral("operators.add", 10, 5)).toBe(15);
  });

  it("an unwired pin with neither a wire nor a literal falls back to the arithmetic factory's defaultLiteral (0)", () => {
    const nodes = [opNode("op1", "operators.add"), graphReturn("ret1")];
    const edges: FlowEdge[] = [{ id: "e1", source: "op1", target: "ret1", sourceHandle: "result", targetHandle: "value" }];
    expect(runGraph(nodes, edges)).toBe(0); // 0 + 0, not a thrown error
  });

  it("an unwired pin with neither a wire nor a literal falls back to the boolean factory's defaultLiteral (false)", () => {
    expect(runBooleanGraph("operators.and", {})).toBe(false); // Boolean(false) && Boolean(false)
  });

  it("NOT with neither a wire nor a literal falls back to defaultLiteral (false) instead of throwing", () => {
    expect(runBooleanGraph("operators.not", {})).toBe(true); // !Boolean(false)
  });
});

describe("main canvas: pure operator nodes are hoisted and emitted (not silently dropped)", () => {
  it("emits an Add node's declaration into a route's handler body and returns the real computed sum over HTTP", async () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/sum" } },
        { id: "add1", type: "operators.add", position: { x: 0, y: 0 }, data: { literals: { a: 5, b: 7 } } },
        { id: "handler", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ sum: _op_add1 });" } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
        // Not the handler's declared "in" exec pin — a distinct value-pin id. This is exactly
        // the shape the "pure value nodes never emitted on the main canvas" gap fix targets:
        // exec-chain.ts's hoistValueDeps decides "is this an exec predecessor?" by checking the
        // edge's targetHandle against the node's *declared exec port*, not a fixed id allowlist,
        // so a value edge landing on any other handle name gets hoisted instead of ignored.
        { id: "e3", source: "add1", target: "handler", sourceHandle: "result", targetHandle: "value" },
        { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    // The Add node's category is "operators" — never part of emitExpress's top-level
    // structural/logic emission loop — so this assertion is the direct proof its statement
    // wasn't silently dropped, independent of the HTTP roundtrip below.
    expect(code).toContain("const _op_add1 = ((5) + (7));");

    const formatted = await formatCode(code);
    await writeGeneratedFile(GENERATED_PATH, formatted);
    writeFileSync(
      path.join(path.dirname(GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "generated-operator-nodes", private: true }),
    );

    const child = spawn(process.execPath, [GENERATED_PATH], { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

      const res = await fetch(`http://localhost:${PORT}/sum`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sum).toBe(12); // the real, live-computed 5 + 7 from the compiled Add node
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
