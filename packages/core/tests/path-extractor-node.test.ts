import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { getNodeDefinition, type EmitContext } from "../src/schema/node-registry.js";
import type { Flow, FlowNode, FlowEdge } from "../src/schema/node.types.js";
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

  describe("wired path input", () => {
    // For wired-path tests, we create a mock source node that looks like a logic.expression
    // or similar (something with a resultIdentifier) and wire it to the path pin
    function makeWiredPathContext(sourceNodeType: string, sourceHandle: string = "result"): EmitContext {
      const sourceNode: FlowNode = { id: "pathSource", type: sourceNodeType, position: { x: 0, y: 0 }, data: {} };
      const peNode: FlowNode = { id: "pe1", type: "logic.pathExtractor", position: { x: 0, y: 0 }, data: {} };
      const flow = makeFlow([sourceNode, peNode], [
        { id: "e1", source: "pathSource", target: "pe1", sourceHandle, targetHandle: "path" },
      ]);
      return {
        flow,
        getNode: (id: string) => flow.nodes.find((n) => n.id === id),
        getIncoming: (nodeId: string, pinId: string) =>
          flow.edges.filter((e) => e.target === nodeId && e.targetHandle === pinId),
        getOutgoing: () => [],
        emitNode: () => {
          throw new Error("unused");
        },
      };
    }

    it("always emits lodash.get import plus the shared runtime helper when path is wired, regardless of path structure", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      const node = pathExtractorNode({ literals: { data_object: "input" } });
      // Use operators.add as a source node since it has a resultIdentifier
      const ctx = makeWiredPathContext("operators.add", "result");
      const emitted = def.emit(node, ctx);
      expect(emitted.imports).toHaveLength(2);
      expect(emitted.imports![0]).toBe('const _pathGet = require("lodash.get");');
      expect(emitted.imports![1]).toContain("function _visualNodePathResolve(obj, path, args)");
    });

    it("calls the shared _visualNodePathResolve helper with the wired path passed as an argument, not embedded inline in the body", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      const node = pathExtractorNode({ literals: { data_object: "input" } });
      const ctx = makeWiredPathContext("operators.add", "result");
      const emitted = def.emit(node, ctx);
      // The body is a single call to the shared helper — no per-instance inline IIFE anymore.
      expect(emitted.body).toBe("const _pathval_pe1 = _visualNodePathResolve((input), _op_pathSource, []);");
      expect(emitted.body).not.toContain("_pathin_pe1");
      expect(emitted.body).not.toContain("=> {");
    });

    it("resolves a plain property via wired path at runtime", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      const node = pathExtractorNode({ literals: { data_object: "__obj" } });
      const ctx = makeWiredPathContext("operators.add", "result");
      const emitted = def.emit(node, ctx);
      // The wired source (operators.add) uses resultIdentifier pattern _op_<id>
      const setup = `
        ${emitted.imports!.join("\n")}
        const __obj = { a: { b: 42 } };
        const _op_pathSource = "a.b";
      `;
      const result = runEmitted(setup, emitted.body!, "_pathval_pe1");
      expect(result).toBe(42);
    });

    it("resolves bracket array element via wired path at runtime", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      const node = pathExtractorNode({ literals: { data_object: "__obj" } });
      const ctx = makeWiredPathContext("operators.add", "result");
      const emitted = def.emit(node, ctx);
      const setup = `
        ${emitted.imports!.join("\n")}
        const __obj = { items: [{ name: "x" }] };
        const _op_pathSource = "items[0].name";
      `;
      const result = runEmitted(setup, emitted.body!, "_pathval_pe1");
      expect(result).toBe("x");
    });

    it("calls a resolved method via wired path with .apply binding when path is wired", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      const node = pathExtractorNode({
        paramCount: 1,
        literals: { data_object: "__obj", "param-0": '"Alice"' },
      });
      const ctx = makeWiredPathContext("operators.add", "result");
      const emitted = def.emit(node, ctx);
      const setup = `
        ${emitted.imports!.join("\n")}
        const _op_pathSource = "greet";
        const __obj = {
          greet: function (name) {
            return "Hello, " + name + " (from " + this.name + ")";
          },
          name: "App"
        };
      `;
      const result = runEmitted(setup, emitted.body!, "_pathval_pe1");
      expect(result).toBe("Hello, Alice (from App)");
    });

    it("throws when path pin has more than one incoming connection", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      const source1: FlowNode = { id: "s1", type: "operators.add", position: { x: 0, y: 0 }, data: {} };
      const source2: FlowNode = { id: "s2", type: "operators.subtract", position: { x: 0, y: 0 }, data: {} };
      const peNode: FlowNode = { id: "pe1", type: "logic.pathExtractor", position: { x: 0, y: 0 }, data: {} };
      const flow = makeFlow([source1, source2, peNode], [
        { id: "e1", source: "s1", target: "pe1", sourceHandle: "result", targetHandle: "path" },
        { id: "e2", source: "s2", target: "pe1", sourceHandle: "result", targetHandle: "path" },
      ]);
      const ctx: EmitContext = {
        flow,
        getNode: (id: string) => flow.nodes.find((n) => n.id === id),
        getIncoming: (nodeId: string, pinId: string) =>
          flow.edges.filter((e) => e.target === nodeId && e.targetHandle === pinId),
        getOutgoing: () => [],
        emitNode: () => {
          throw new Error("unused");
        },
      };
      expect(() => def.emit(peNode, ctx)).toThrow(/more than one incoming connection/);
    });

    it("wired path takes precedence even when data.path is set", () => {
      const def = getNodeDefinition("logic.pathExtractor")!;
      // Node has a stale literal path (empty), but it's wired — wired wins, no empty-path error
      const node = pathExtractorNode({ path: "", literals: { data_object: "__obj" } });
      const ctx = makeWiredPathContext("operators.add", "result");
      const emitted = def.emit(node, ctx);
      const setup = `
        ${emitted.imports!.join("\n")}
        const __obj = { a: { b: 42 } };
        const _op_pathSource = "a.b";
      `;
      const result = runEmitted(setup, emitted.body!, "_pathval_pe1");
      expect(result).toBe(42);
    });
  });
});
