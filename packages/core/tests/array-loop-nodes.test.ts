import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { validateFlow } from "../src/schema/validate.js";
import type { Flow } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = path.join(__dirname, "fixtures", "generated-array-loop-nodes", "server.js");
// Distinct from other core spawn-test ports (see array-nodes.test.ts's header comment for
// the full list) — array-nodes.test.ts already reserves 4010.
const PORT = 4011;

afterAll(() => {
  rmSync(path.join(__dirname, "fixtures", "generated-array-loop-nodes"), { recursive: true, force: true });
});

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

const ITEMS_VARIABLE: Flow["variables"] = [
  { id: "v1", name: "items", keyword: "let", dataType: "array", defaultValue: "[1, 2, 3]" },
];

describe("wired loop body: array.map", () => {
  it("compiles the wired body into the callback with per-node-unique context identifiers", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "map1", type: "array.map", position: { x: 0, y: 0 }, data: {} },
        { id: "mul1", type: "operators.multiply", position: { x: 0, y: 0 }, data: { literals: { b: "2" } } },
        { id: "ret1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "map1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_get", target: "map1", sourceHandle: "value", targetHandle: "array" },
        { id: "e4", source: "map1", target: "ret1", sourceHandle: "loopBody", targetHandle: "in" },
        { id: "e5", source: "map1", target: "mul1", sourceHandle: "element", targetHandle: "a" },
        { id: "e6", source: "mul1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
        { id: "e7", source: "map1", target: "handler", sourceHandle: "completed", targetHandle: "in" },
        { id: "e8", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = ITEMS_VARIABLE;

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    expect(code).toContain("const _arr_map1 = (items).map((_item_map1, _index_map1, _array_map1) => {");
    expect(code).toContain("const _op_mul1 = ((_item_map1) * (2));");
    expect(code).toContain("return (_op_mul1);");
    // "completed" continues the trunk in the same scope, not nested inside the callback.
    expect(code.indexOf("});")).toBeLessThan(code.indexOf("res.status(200).json"));
  });
});

describe("wired loop body: array.reduce", () => {
  it("resolves the accumulator context pin and splices initialValue", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "red1", type: "array.reduce", position: { x: 0, y: 0 }, data: { initialValue: "10" } },
        { id: "add1", type: "operators.add", position: { x: 0, y: 0 }, data: {} },
        { id: "ret1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "red1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_get", target: "red1", sourceHandle: "value", targetHandle: "array" },
        { id: "e4", source: "red1", target: "ret1", sourceHandle: "loopBody", targetHandle: "in" },
        { id: "e5", source: "red1", target: "add1", sourceHandle: "accumulator", targetHandle: "a" },
        { id: "e6", source: "red1", target: "add1", sourceHandle: "element", targetHandle: "b" },
        { id: "e7", source: "add1", target: "ret1", sourceHandle: "result", targetHandle: "value" },
        { id: "e8", source: "red1", target: "handler", sourceHandle: "completed", targetHandle: "in" },
        { id: "e9", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = ITEMS_VARIABLE;

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    expect(code).toContain("const _arr_red1 = (items).reduce((_acc_red1, _item_red1, _index_red1, _array_red1) => {");
    expect(code).toContain("const _op_add1 = ((_acc_red1) + (_item_red1));");
    expect(code).toContain("}, 10);");
  });
});

describe("cross-arm violation: reading a context pin from outside the loop body", () => {
  it("rejects reading Map's Element pin from a node positioned after Completed", () => {
    const flow = makeFlow(
      [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/x" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "map1", type: "array.map", position: { x: 0, y: 0 }, data: {} },
        { id: "ret1", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: { literals: { value: "0" } } },
        { id: "cl1", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: {} },
        { id: "handler", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: {} } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } },
      ],
      [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "map1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_get", target: "map1", sourceHandle: "value", targetHandle: "array" },
        { id: "e4", source: "map1", target: "ret1", sourceHandle: "loopBody", targetHandle: "in" },
        { id: "e5", source: "map1", target: "cl1", sourceHandle: "completed", targetHandle: "in" },
        // Illegal: "element" only exists inside map1's own loop-body arm, but cl1 sits on
        // map1's "completed" continuation — the same (trunk) scope as map1 itself.
        { id: "e6", source: "map1", target: "cl1", sourceHandle: "element", targetHandle: "value" },
        { id: "e7", source: "cl1", target: "handler", sourceHandle: "out", targetHandle: "in" },
        { id: "e8", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    flow.variables = ITEMS_VARIABLE;

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("computed only inside Branch/Switch arm"))).toBe(true);
  });
});

describe("end-to-end: fully wired loop bodies (no callback text) compile and run over real HTTP", () => {
  it("filters and maps an array via wired Return/operator chains, responding with the transformed result", async () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "array-loop-nodes-api", target: "express" },
      variables: [{ id: "v1", name: "items", keyword: "let", dataType: "array", defaultValue: "[1, 2, 3, 4, 5]" }],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/doubled-evens" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
        { id: "filter1", type: "array.filter", position: { x: 0, y: 0 }, data: {} },
        { id: "mod1", type: "operators.modulo", position: { x: 0, y: 0 }, data: { literals: { b: "2" } } },
        { id: "eq1", type: "operators.equal", position: { x: 0, y: 0 }, data: { literals: { b: "0" } } },
        { id: "retF", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} },
        { id: "map1", type: "array.map", position: { x: 0, y: 0 }, data: {} },
        { id: "mul1", type: "operators.multiply", position: { x: 0, y: 0 }, data: { literals: { b: "2" } } },
        { id: "retM", type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} },
        {
          id: "handler",
          type: "handler.customCode",
          position: { x: 0, y: 0 },
          data: { code: "res.status(200).json({ result: _arr_map1 });" },
        },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: PORT } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "filter1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_get", target: "filter1", sourceHandle: "value", targetHandle: "array" },
        { id: "e4", source: "filter1", target: "mod1", sourceHandle: "element", targetHandle: "a" },
        { id: "e5", source: "mod1", target: "eq1", sourceHandle: "result", targetHandle: "a" },
        { id: "e6", source: "eq1", target: "retF", sourceHandle: "result", targetHandle: "value" },
        { id: "e7", source: "filter1", target: "retF", sourceHandle: "loopBody", targetHandle: "in" },
        { id: "e8", source: "filter1", target: "map1", sourceHandle: "completed", targetHandle: "in" },
        { id: "e9", source: "filter1", target: "map1", sourceHandle: "result", targetHandle: "array" },
        { id: "e10", source: "map1", target: "mul1", sourceHandle: "element", targetHandle: "a" },
        { id: "e11", source: "mul1", target: "retM", sourceHandle: "result", targetHandle: "value" },
        { id: "e12", source: "map1", target: "retM", sourceHandle: "loopBody", targetHandle: "in" },
        { id: "e13", source: "map1", target: "handler", sourceHandle: "completed", targetHandle: "in" },
        { id: "e14", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const result = validateFlow(flow);
    expect(result.valid).toBe(true);

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    await writeGeneratedFile(GENERATED_PATH, formatted);
    writeFileSync(
      path.join(path.dirname(GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "array-loop-nodes-api", private: true }),
    );

    const child = spawn(process.execPath, [GENERATED_PATH], { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

      const res = await fetch(`http://localhost:${PORT}/doubled-evens`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ result: [4, 8] });
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
