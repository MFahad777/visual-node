import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { getNodeDefinition, type EmitContext } from "../src/schema/node-registry.js";
import type { Flow, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const nodeRequire = createRequire(import.meta.url);

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function pathExtractorNode(data: Record<string, unknown>): FlowNode {
  return { id: "pe1", type: "logic.pathExtractor", position: { x: 0, y: 0 }, data };
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

/** Actually runs the node's emitted `imports` + `body` (with `setupCode` providing test fixtures
 * like a mock object) via a real `require`, proving the generated code executes correctly —
 * not just that the generated string looks right. */
function runEmitted(setupCode: string, body: string, resultVar = "_pathval_pe1"): unknown {
  const fn = new Function("require", `${setupCode}\n${body}\nreturn ${resultVar};`);
  return fn(nodeRequire);
}

describe("logic.pathExtractor", () => {
  it("throws at compile time when the path is empty", () => {
    // logic.pathExtractor declares an explicit exec-entry port, so (like variable.set) it's
    // only discovered via an exec-chain walk, not unconditionally collected as a free-standing
    // declaration — must be wired from something (here, logic.begin) for emit() to run at all.
    const flow = makeFlow(
      [
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        pathExtractorNode({ path: "" }),
      ],
      [{ id: "e1", source: "begin", target: "pe1", sourceHandle: "out", targetHandle: "in" }],
    );
    expect(() => emitExpress(flow)).toThrow(/empty path/);
  });

  it("emits no imports for a shallow path (0 or 1 parent segments) — optional chaining suffices", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "a.b", literals: { data_object: "input" } });
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.imports).toEqual([]);
    expect(emitted.body).toContain("const _pathval_pe1 = (() => {");
  });

  it("requires only lodash.get (not the full lodash package) once a path has 2+ parent segments", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "a.b.c", literals: { data_object: "input" } });
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.imports).toEqual(['const _pathGet = require("lodash.get");']);
  });

  it("splits the parent path from the last segment at compile time, using lodash.get only for the multi-hop parent walk", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "items[0].name", literals: { data_object: "input" } });
    const emitted = def.emit(node, emptyCtx);
    // Parent path "items[0]" passed as string directly to lodash.get (which handles bracket notation natively)
    expect(emitted.body).toContain(`_pathGet(_pathobj_pe1, ${JSON.stringify("items[0]")})`);
    expect(emitted.body).toContain(`_pathparent_pe1?.[${JSON.stringify("name")}]`);
  });

  it("collects param-<N> pins in order into the __args array, defaulting to undefined when unwired/no literal", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({
      path: "billing.calculateTotal",
      paramCount: 2,
      literals: { data_object: "input", "param-0": "100" },
    });
    const emitted = def.emit(node, emptyCtx);
    expect(emitted.body).toContain("const _pathargs_pe1 = [(100), (undefined)];");
  });

  it("resolves a plain (non-function) property and returns it as-is, ignoring params", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "billing.currency", literals: { data_object: "__obj" } });
    const emitted = def.emit(node, emptyCtx);
    const result = runEmitted(
      `${emitted.imports!.join("\n")}\nconst __obj = { billing: { currency: "USD" } };`,
      emitted.body!,
    );
    expect(result).toBe("USD");
  });

  it("resolves a bracket-indexed array element via a dot/bracket path", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "items[1].name", literals: { data_object: "__obj" } });
    const emitted = def.emit(node, emptyCtx);
    const result = runEmitted(
      `${emitted.imports!.join("\n")}\nconst __obj = { items: [{ name: "x" }, { name: "y" }] };`,
      emitted.body!,
    );
    expect(result).toBe("y");
  });

  it("is null-safe: an unwired/undefined object resolves to undefined instead of throwing", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "a.b" });
    const emitted = def.emit(node, emptyCtx);
    const result = runEmitted(emitted.imports!.join("\n"), emitted.body!);
    expect(result).toBeUndefined();
  });

  it("handles mixed bracket and dot notation paths like a[0].b.c", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({ path: "a[0].b.c", literals: { data_object: "__obj" } });
    const emitted = def.emit(node, emptyCtx);
    // Parent path "a[0].b" has both bracket and dot, so needs lodash
    expect(emitted.imports).toEqual(['const _pathGet = require("lodash.get");']);
    const result = runEmitted(
      `${emitted.imports!.join("\n")}\nconst __obj = { a: [{ b: { c: 42 } }] };`,
      emitted.body!,
    );
    expect(result).toBe(42);
  });

  // Matches the exact verification matrix from the original Path Extractor spec: a method
  // resolved off a nested object, called with 3 dynamically-added params, preserving `this` so
  // `applyDiscount` reads the passed argument as a real method call would.
  it("calls a resolved method via .apply, binding the correct parent object as `this`", () => {
    const def = getNodeDefinition("logic.pathExtractor")!;
    const node = pathExtractorNode({
      path: "billing.calculateTotal",
      paramCount: 3,
      literals: { data_object: "__mockSystem", "param-0": "100", "param-1": "0.1", "param-2": "true" },
    });
    const emitted = def.emit(node, emptyCtx);
    const setup = `
      ${emitted.imports!.join("\n")}
      const __mockSystem = {
        billing: {
          currency: "USD",
          calculateTotal: function (subtotal, taxRate, applyDiscount) {
            const base = subtotal * (1 + taxRate);
            return applyDiscount ? base * 0.9 : base;
          },
        },
      };
    `;
    const result = runEmitted(setup, emitted.body!);
    expect(result).toBeCloseTo(99);
  });
});
