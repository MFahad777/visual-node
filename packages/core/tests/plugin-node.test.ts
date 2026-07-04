import { describe, expect, it } from "vitest";
import { validatePluginNodeSpec, type PluginNodeSpec } from "../src/plugins/plugin-schema.js";
import { createPluginNodeDefinition } from "../src/plugins/plugin-node.js";
import { getNodeDefinition, registerNode, type EmitContext, type NodeDefinition } from "../src/schema/node-registry.js";
import type { Flow, FlowEdge, FlowNode } from "../src/schema/node.types.js";
import { collectFlowDependencies } from "../src/project/collect-dependencies.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import { validateFlow } from "../src/schema/validate.js";
import { emitExpress } from "../src/codegen/emit-express.js";

registerBuiltinNodes();

/** Deep-clones the fixture so each test can mutate its own copy without cross-contaminating others. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const VALID_SPEC: PluginNodeSpec = {
  schemaVersion: 1,
  type: "plugin.httpRequest",
  category: "handler",
  label: "HTTP Request",
  description: "Makes an HTTP request via axios and stores the response.",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "url", label: "URL", kind: "value" },
  ],
  outputs: [
    { id: "out", label: "Out", kind: "exec" },
    { id: "response", label: "Response", kind: "value" },
  ],
  configSchema: [{ key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"], default: "GET" }],
  npmDependencies: { axios: "^1.7.0" },
  async: true,
  codegen: {
    imports: ['const axios = require("axios");'],
    body: "const {{result}} = await axios({ method: {{config.method}}, url: {{url}} });",
  },
};

describe("validatePluginNodeSpec", () => {
  it("accepts a fully valid spec", () => {
    expect(validatePluginNodeSpec(VALID_SPEC)).toEqual([]);
  });

  it("rejects a non-object", () => {
    expect(validatePluginNodeSpec(null)).not.toEqual([]);
    expect(validatePluginNodeSpec("nope")).not.toEqual([]);
  });

  it("rejects an invalid type prefix", () => {
    const spec = clone(VALID_SPEC);
    (spec as any).type = "notPlugin.httpRequest";
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes('"type"') && e.includes("plugin\\."))).toBe(true);
  });

  it("rejects an invalid category", () => {
    const spec = clone(VALID_SPEC);
    (spec as any).category = "bogusCategory";
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes('"category"'))).toBe(true);
  });

  it("rejects two exec-kind inputs", () => {
    const spec = clone(VALID_SPEC);
    spec.inputs = [
      { id: "in", label: "In", kind: "exec" },
      { id: "in2", label: "In2", kind: "exec" },
    ];
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes('"inputs"') && e.includes("exec"))).toBe(true);
  });

  it('rejects an exec-kind output whose id is not "out"', () => {
    const spec = clone(VALID_SPEC);
    spec.outputs = [
      { id: "done", label: "Done", kind: "exec" },
      { id: "response", label: "Response", kind: "value" },
    ];
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes('must be id "out"'))).toBe(true);
  });

  it("rejects a codegen template referencing an undeclared placeholder", () => {
    const spec = clone(VALID_SPEC);
    spec.codegen.body = "const {{result}} = {{undeclaredThing}};";
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes("undeclaredThing"))).toBe(true);
  });

  it("rejects a codegen template referencing an exec-kind pin as a placeholder", () => {
    const spec = clone(VALID_SPEC);
    spec.codegen.body = "const {{result}} = {{in}};"; // "in" is exec-kind, not a value pin
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes('"{{in}}"'))).toBe(true);
  });

  it('rejects "{{result}}" usage with no declared value output', () => {
    const spec = clone(VALID_SPEC);
    spec.outputs = [{ id: "out", label: "Out", kind: "exec" }];
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes("{{result}}") && e.includes("no"))).toBe(true);
  });

  it('rejects a declared value output with no "{{result}}" usage anywhere', () => {
    const spec = clone(VALID_SPEC);
    spec.codegen.body = "axios({ method: {{config.method}}, url: {{url}} });";
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes("{{result}}"))).toBe(true);
  });

  it("rejects duplicate configSchema keys", () => {
    const spec = clone(VALID_SPEC);
    spec.configSchema = [
      { key: "method", label: "Method", type: "text" },
      { key: "method", label: "Method Again", type: "text" },
    ];
    // Also drop the now-invalid config.method reference is unaffected — still valid text type.
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes("duplicate key"))).toBe(true);
  });

  it('rejects a "select" config field with no options', () => {
    const spec = clone(VALID_SPEC);
    spec.configSchema = [{ key: "method", label: "Method", type: "select" }];
    const errors = validatePluginNodeSpec(spec);
    expect(errors.some((e) => e.includes("select") && e.includes("options"))).toBe(true);
  });

  it("reports multiple problems at once, not just the first", () => {
    const errors = validatePluginNodeSpec({
      schemaVersion: 2,
      type: "bad",
      category: "bogus",
    });
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe("createPluginNodeDefinition", () => {
  it("throws when given a spec that fails validation", () => {
    const spec = clone(VALID_SPEC);
    (spec as any).type = "not-even-plugin-prefixed";
    expect(() => createPluginNodeDefinition(spec)).toThrow();
  });

  it("carries npmDependencies and requiresAsync onto the produced NodeDefinition", () => {
    const spec = clone(VALID_SPEC);
    spec.type = "plugin.testDepsAndAsync";
    const def = createPluginNodeDefinition(spec);
    expect(def.npmDependencies).toEqual({ axios: "^1.7.0" });
    expect(def.requiresAsync).toBe(true);
  });

  it("requiresAsync is false when the spec omits `async`", () => {
    const spec = clone(VALID_SPEC);
    spec.type = "plugin.testNoAsync";
    delete spec.async;
    const def = createPluginNodeDefinition(spec);
    expect(def.requiresAsync).toBe(false);
  });

  describe("emit() template substitution", () => {
    const EMIT_SPEC: PluginNodeSpec = {
      schemaVersion: 1,
      type: "plugin.testEmit1",
      category: "logic",
      label: "Test Emit",
      description: "Test-only plugin node exercising every placeholder kind.",
      inputs: [
        { id: "in", label: "In", kind: "exec" },
        { id: "value1", label: "Value1", kind: "value" },
      ],
      outputs: [
        { id: "out", label: "Out", kind: "exec" },
        { id: "outVal", label: "OutVal", kind: "value" },
      ],
      configSchema: [
        { key: "codeField", label: "Code", type: "code", default: "defaultCode();" },
        { key: "textField", label: "Text", type: "text", default: "hello" },
        { key: "numField", label: "Num", type: "number", default: 5 },
        { key: "boolField", label: "Bool", type: "boolean", default: false },
      ],
      codegen: {
        setup:
          "const {{result}} = fn({{value1}}, {{config.codeField}}, {{config.textField}}, {{config.numField}}, {{config.boolField}});",
      },
    };

    /** A minimal value-producing node type, standing in for whatever upstream node a
     * plugin's value-input pin might be wired to. */
    const valueSourceDef: NodeDefinition = {
      type: "test.pluginValueSource",
      category: "logic",
      label: "Test Value Source",
      description: "Test-only node with a resultIdentifier, used to wire a plugin's value input.",
      inputs: [],
      outputs: [{ id: "out", label: "Out", kind: "value" }],
      configSchema: [],
      emit: () => ({ setup: "", order: 0 }),
      resultIdentifier: () => "srcValue",
    };
    if (!getNodeDefinition(valueSourceDef.type)) registerNode(valueSourceDef);

    function buildCtx(nodes: FlowNode[], edges: FlowEdge[]): EmitContext {
      const nodesById = new Map(nodes.map((n) => [n.id, n]));
      const matchesHandle = (edge: FlowEdge, side: "source" | "target", handle?: string) =>
        handle === undefined || (side === "source" ? edge.sourceHandle : edge.targetHandle) === handle;
      const ctx: EmitContext = {
        flow: { version: "1", meta: { name: "t", target: "express" }, nodes, edges },
        getNode: (id) => nodesById.get(id),
        getIncoming: (id, handle) => edges.filter((e) => e.target === id && matchesHandle(e, "target", handle)),
        getOutgoing: (id, handle) => edges.filter((e) => e.source === id && matchesHandle(e, "source", handle)),
        emitNode: (id) => {
          const node = nodesById.get(id);
          if (!node) throw new Error(`unknown node ${id}`);
          return getNodeDefinition(node.type)!.emit(node, ctx);
        },
      };
      return ctx;
    }

    it("substitutes a wired value-input pin with the upstream node's result identifier", () => {
      const def = createPluginNodeDefinition(EMIT_SPEC);
      const pluginNode: FlowNode = {
        id: "p1",
        type: EMIT_SPEC.type,
        position: { x: 0, y: 0 },
        data: {},
      };
      const sourceNode: FlowNode = { id: "src1", type: "test.pluginValueSource", position: { x: 0, y: 0 }, data: {} };
      const edges: FlowEdge[] = [{ id: "e1", source: "src1", target: "p1", sourceHandle: "out", targetHandle: "value1" }];
      const ctx = buildCtx([sourceNode, pluginNode], edges);

      const emitted = def.emit(pluginNode, ctx);
      expect(emitted.setup).toContain("(srcValue)");
    });

    it("falls back to the literal-default ('undefined') when the value-input pin is unwired", () => {
      const def = createPluginNodeDefinition(EMIT_SPEC);
      const pluginNode: FlowNode = { id: "p2", type: EMIT_SPEC.type, position: { x: 0, y: 0 }, data: {} };
      const ctx = buildCtx([pluginNode], []);

      const emitted = def.emit(pluginNode, ctx);
      expect(emitted.setup).toContain("(undefined)");
    });

    it('substitutes "code"-type config fields verbatim (no quoting)', () => {
      const def = createPluginNodeDefinition(EMIT_SPEC);
      const pluginNode: FlowNode = {
        id: "p3",
        type: EMIT_SPEC.type,
        position: { x: 0, y: 0 },
        data: { codeField: "doSomethingRaw();" },
      };
      const ctx = buildCtx([pluginNode], []);

      const emitted = def.emit(pluginNode, ctx);
      expect(emitted.setup).toContain("doSomethingRaw();");
      expect(emitted.setup).not.toContain('"doSomethingRaw();"');
    });

    it('substitutes "text"/"number"/"boolean"-type config fields via JSON.stringify', () => {
      const def = createPluginNodeDefinition(EMIT_SPEC);
      const pluginNode: FlowNode = {
        id: "p4",
        type: EMIT_SPEC.type,
        position: { x: 0, y: 0 },
        data: { textField: "hello world", numField: 42, boolField: true },
      };
      const ctx = buildCtx([pluginNode], []);

      const emitted = def.emit(pluginNode, ctx);
      expect(emitted.setup).toContain('"hello world"');
      expect(emitted.setup).toContain("42");
      expect(emitted.setup).toContain("true");
    });

    it("uses each config field's declared default when node.data omits the key", () => {
      const def = createPluginNodeDefinition(EMIT_SPEC);
      const pluginNode: FlowNode = { id: "p5", type: EMIT_SPEC.type, position: { x: 0, y: 0 }, data: {} };
      const ctx = buildCtx([pluginNode], []);

      const emitted = def.emit(pluginNode, ctx);
      expect(emitted.setup).toContain("defaultCode();");
      expect(emitted.setup).toContain('"hello"');
      expect(emitted.setup).toContain("5");
      expect(emitted.setup).toContain("false");
    });

    it('"{{result}}" produces the identifier resultIdentifier() itself returns, for the same node', () => {
      const def = createPluginNodeDefinition(EMIT_SPEC);
      const pluginNode: FlowNode = { id: "p6", type: EMIT_SPEC.type, position: { x: 0, y: 0 }, data: {} };
      const ctx = buildCtx([pluginNode], []);

      const emitted = def.emit(pluginNode, ctx);
      const expectedIdentifier = def.resultIdentifier!(pluginNode);
      expect(emitted.setup).toContain(`const ${expectedIdentifier} =`);
    });
  });
});

describe("plugin type-level npmDependencies feed collectFlowDependencies", () => {
  it("two instances of the same plugin type contribute the dependency once, with no conflict", () => {
    const spec: PluginNodeSpec = {
      schemaVersion: 1,
      type: "plugin.testDepDup",
      category: "logic",
      label: "Test Dep Dup",
      description: "Test-only plugin node declaring a fixed npm dependency.",
      inputs: [],
      outputs: [],
      configSchema: [],
      npmDependencies: { axios: "^1.7.0" },
      codegen: { setup: "// noop" },
    };
    const def = createPluginNodeDefinition(spec);
    if (!getNodeDefinition(def.type)) registerNode(def);

    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      nodes: [
        { id: "n1", type: spec.type, position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: spec.type, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };

    const { dependencies, conflicts } = collectFlowDependencies(flow);
    expect(dependencies.axios).toBe("^1.7.0");
    expect(conflicts).toEqual([]);
  });
});

/**
 * A second, deliberately DIFFERENT worked plugin — proving the plugin engine isn't shaped
 * around the HTTP Request/axios example. This one wraps a different npm package (`slugify`),
 * has NO exec pins at all (a pure value-computation node, like a builtin operator — e.g.
 * `operators.add` — rather than a chain-position node like HTTP Request), lives in a
 * different category, is synchronous (no `async`), and uses a "boolean"-type config field
 * (the HTTP Request example only ever exercises "select"/"text").
 */
const SLUGIFY_SPEC: PluginNodeSpec = {
  schemaVersion: 1,
  type: "plugin.slugify",
  category: "operators",
  label: "Slugify",
  description: "Converts text into a URL-friendly slug via the npm `slugify` package.",
  inputs: [{ id: "text", label: "Text", kind: "value" }],
  outputs: [{ id: "slug", label: "Slug", kind: "value" }],
  configSchema: [{ key: "lower", label: "Lowercase", type: "boolean", default: true }],
  npmDependencies: { slugify: "^1.6.6" },
  codegen: {
    imports: ['const slugify = require("slugify");'],
    setup: "const {{result}} = slugify({{text}}, { lower: {{config.lower}} });",
  },
};

describe("a second, differently-shaped plugin (pure value, no exec pins, different package)", () => {
  it("validates cleanly despite having zero exec pins and a boolean config field", () => {
    expect(validatePluginNodeSpec(SLUGIFY_SPEC)).toEqual([]);
  });

  it("produces a NodeDefinition with no exec-kind ports at all", () => {
    const def = createPluginNodeDefinition(SLUGIFY_SPEC);
    expect(def.inputs.every((p) => p.kind !== "exec")).toBe(true);
    expect(def.outputs.every((p) => p.kind !== "exec")).toBe(true);
    expect(def.requiresAsync).toBe(false);
    expect(def.npmDependencies).toEqual({ slugify: "^1.6.6" });
  });

  it("emits the wired text expression and the boolean config value, defaulting when unwired/unset", () => {
    const def = createPluginNodeDefinition(SLUGIFY_SPEC);

    const valueSourceDef: NodeDefinition = {
      type: "test.slugifyValueSource",
      category: "logic",
      label: "Test Slugify Value Source",
      description: "Test-only node standing in for whatever feeds the Slugify node's text input.",
      inputs: [],
      outputs: [{ id: "out", label: "Out", kind: "value" }],
      configSchema: [],
      emit: () => ({ setup: "", order: 0 }),
      resultIdentifier: () => "titleText",
    };
    if (!getNodeDefinition(valueSourceDef.type)) registerNode(valueSourceDef);

    const pluginNode: FlowNode = { id: "slug1", type: SLUGIFY_SPEC.type, position: { x: 0, y: 0 }, data: {} };
    const sourceNode: FlowNode = { id: "src2", type: "test.slugifyValueSource", position: { x: 0, y: 0 }, data: {} };
    const edges: FlowEdge[] = [{ id: "e2", source: "src2", target: "slug1", sourceHandle: "out", targetHandle: "text" }];

    const nodesById = new Map([sourceNode, pluginNode].map((n) => [n.id, n]));
    const matchesHandle = (edge: FlowEdge, side: "source" | "target", handle?: string) =>
      handle === undefined || (side === "source" ? edge.sourceHandle : edge.targetHandle) === handle;
    const ctx: EmitContext = {
      flow: { version: "1", meta: { name: "t", target: "express" }, nodes: [sourceNode, pluginNode], edges },
      getNode: (id) => nodesById.get(id),
      getIncoming: (id, handle) => edges.filter((e) => e.target === id && matchesHandle(e, "target", handle)),
      getOutgoing: (id, handle) => edges.filter((e) => e.source === id && matchesHandle(e, "source", handle)),
      emitNode: (id) => {
        const node = nodesById.get(id);
        if (!node) throw new Error(`unknown node ${id}`);
        return getNodeDefinition(node.type)!.emit(node, ctx);
      },
    };

    const emitted = def.emit(pluginNode, ctx);
    expect(emitted.setup).toContain("slugify((titleText), { lower: true })");
    expect(emitted.imports).toEqual(['const slugify = require("slugify");']);

    // Unwired + explicit config override: falls back to "undefined" for the pin, and
    // respects a node-data override (rather than the field's default) for the config value.
    const unwiredNode: FlowNode = { id: "slug2", type: SLUGIFY_SPEC.type, position: { x: 0, y: 0 }, data: { lower: false } };
    const emptyCtx: EmitContext = {
      ...ctx,
      getNode: (id) => (id === "slug2" ? unwiredNode : undefined),
      getIncoming: () => [],
      getOutgoing: () => [],
    };
    const emittedUnwired = def.emit(unwiredNode, emptyCtx);
    expect(emittedUnwired.setup).toContain("slugify((undefined), { lower: false })");
  });

  it("aggregates dependencies from TWO DIFFERENT plugin types used together in one flow", () => {
    const httpSpec = clone(VALID_SPEC);
    httpSpec.type = "plugin.testHttpAlongsideSlugify";
    const httpDef = createPluginNodeDefinition(httpSpec);
    if (!getNodeDefinition(httpDef.type)) registerNode(httpDef);

    const slugifyDef = createPluginNodeDefinition(SLUGIFY_SPEC);
    if (!getNodeDefinition(slugifyDef.type)) registerNode(slugifyDef);

    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      nodes: [
        { id: "n1", type: httpSpec.type, position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: SLUGIFY_SPEC.type, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };

    const { dependencies, conflicts } = collectFlowDependencies(flow);
    expect(dependencies.axios).toBe("^1.7.0");
    expect(dependencies.slugify).toBe("^1.6.6");
    expect(conflicts).toEqual([]);
  });
});

/**
 * Regression coverage for two real bugs found only by live browser verification (never by
 * `tsc` or the unit-level tests above, which construct their own `EmitContext` by hand and so
 * never exercise the real `validateFlow`/`emitExpress`/`exec-chain.ts` pipeline a plugin node
 * actually runs through on a real canvas):
 *
 * 1. `validate.ts`'s Route-handler-chain-entry check used to be a hardcoded category
 *    allow-list (`handler`/`debugging`/`controlFlow`, plus a `logic.functionCall` special
 *    case) that rejected the shipped worked-example plugin template's own `category: "logic"`
 *    with "Route must connect to a handler node" — even though the plugin declares a
 *    perfectly valid exec-entry port. Fixed by asking `execEntryPort()` instead of checking
 *    category membership.
 * 2. `exec-chain.ts`'s `emitBlock`/`hoistValueDepsCore` only ever read `.body` off a
 *    handler-chain-nested node's `EmittedCode`, silently dropping `.imports` — so a plugin's
 *    declared `require("axios")` line never reached the generated file. Confirmed by actually
 *    running the generated code: it compiled with zero errors but crashed at runtime with
 *    `ReferenceError: axios is not defined`. Fixed by threading `imports` through
 *    `hoistValueDepsCore`/`emitBlock`/`emitExecChain` and merging them into `route.node.ts`'s
 *    (and `logic.function`'s, via `emitFunctionGraphBody`) own returned `EmittedCode.imports`.
 */
describe("a chain-position plugin node wired into a real Route — full pipeline regression", () => {
  const CHAIN_PLUGIN_SPEC: PluginNodeSpec = {
    schemaVersion: 1,
    type: "plugin.testChainImportRegression",
    // Deliberately NOT "handler" — this is exactly what the old HANDLER_CHAIN_ENTRY_CATEGORIES
    // allow-list in validate.ts used to reject, and exactly what the shipped HTTP Request
    // template (also category "logic") hit in real browser verification.
    category: "logic",
    label: "Test Chain Import Regression",
    description: "Test-only plugin node proving imports survive being placed in a Route's handler chain.",
    inputs: [{ id: "in", label: "In", kind: "exec" }],
    outputs: [{ id: "out", label: "Out", kind: "exec" }],
    configSchema: [],
    codegen: {
      imports: ['const testLibXyz = require("test-lib-xyz");'],
      body: "testLibXyz.doSomething();",
    },
  };

  it("validateFlow accepts a non-handler-category plugin as a Route's chain entry", () => {
    const def = createPluginNodeDefinition(CHAIN_PLUGIN_SPEC);
    if (!getNodeDefinition(def.type)) registerNode(def);

    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/plugin-test" } },
        { id: "plug1", type: CHAIN_PLUGIN_SPEC.type, position: { x: 0, y: 0 }, data: {} },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 0 } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route", target: "plug1", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const result = validateFlow(flow);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("emitExpress includes the plugin's declared require() line in the generated file", () => {
    const def = createPluginNodeDefinition(CHAIN_PLUGIN_SPEC);
    if (!getNodeDefinition(def.type)) registerNode(def);

    const flow: Flow = {
      version: "1",
      meta: { name: "test", target: "express" },
      nodes: [
        { id: "init2", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route2", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/plugin-test-2" } },
        { id: "plug2", type: CHAIN_PLUGIN_SPEC.type, position: { x: 0, y: 0 }, data: {} },
        { id: "listen2", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 0 } },
      ],
      edges: [
        { id: "e1", source: "init2", target: "route2", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route2", target: "plug2", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "init2", target: "listen2", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const { code } = emitExpress(flow);
    // This is the exact line that was silently dropped before the exec-chain.ts fix — its
    // absence here (with a passing compile) is precisely the "ships broken code silently"
    // failure mode the browser verification agent caught by actually running the output.
    expect(code).toContain('const testLibXyz = require("test-lib-xyz");');
    expect(code).toContain("testLibXyz.doSomething();");
  });
});
