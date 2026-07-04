import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { EditorService } from "@visual-node/proto-gen";
import { clearRegistry, getNodeDefinition, registerBuiltinNodes, type PluginNodeSpec } from "@visual-node/core";
import { registerPluginsRoutes } from "../../src/connect/plugins.service.js";
import { registerNodeRegistryFlowRoutes } from "../../src/connect/node-registry-flow.service.js";
import { loadInstalledPlugins } from "../../src/plugin-loading.js";

// Mirrors files.service.test.ts's harness pattern: mkdtempSync temp project dir,
// createRouterTransport() + createClient() for a real in-process Connect round-trip.
//
// Unlike files.service.ts's CRUD RPCs (which throw ConnectError on expected failures),
// InstallPlugin always resolves with `{ ok, errors }` — see plugins.service.ts's doc comment
// — so every "expected failure" scenario below asserts on the response shape, never on a
// rejected promise.

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "flowserver-plugins-test-"));
  // The node registry is a module-level singleton shared across every test in this file
  // (vitest isolates *files*, not individual `it()`s) — reset + re-seed with the builtins
  // before each test so cross-test plugin registrations never leak into an unrelated test's
  // assertions (e.g. GetNodeRegistry's definition count).
  clearRegistry();
  registerBuiltinNodes();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function makeClient(dir: string) {
  const transport = createRouterTransport((router) => {
    registerPluginsRoutes(router, { projectDir: dir });
    registerNodeRegistryFlowRoutes(router, { projectDir: dir });
  });
  return createClient(EditorService, transport);
}

function toBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
}

function baseSpec(type: string): PluginNodeSpec {
  return {
    schemaVersion: 1,
    type,
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
    configSchema: [{ key: "method", label: "Method", type: "select", options: ["GET", "POST"], default: "GET" }],
    npmDependencies: { axios: "^1.7.0" },
    async: true,
    codegen: {
      imports: ['const axios = require("axios");'],
      body: "const {{result}} = await axios({ method: {{config.method}}, url: {{url}} });",
    },
  };
}

describe("InstallPlugin", () => {
  it("installs a valid plugin, writes the expected file, and it appears in GetNodeRegistry", async () => {
    const client = makeClient(projectDir);
    const spec = baseSpec("plugin.httpRequestTest");

    const res = await client.installPlugin({ pluginJson: toBytes(spec) });

    expect(res.ok).toBe(true);
    expect(res.type).toBe("plugin.httpRequestTest");
    expect(res.relativePath).toBe(".flowserver/plugins/plugin.httpRequestTest.node.json");
    expect(res.errors).toEqual([]);

    const onDiskPath = path.join(projectDir, ".flowserver", "plugins", "plugin.httpRequestTest.node.json");
    expect(existsSync(onDiskPath)).toBe(true);
    expect(JSON.parse(readFileSync(onDiskPath, "utf8"))).toEqual(spec);

    const registry = await client.getNodeRegistry({});
    expect(registry.definitions.some((d) => d.type === "plugin.httpRequestTest")).toBe(true);
  });

  it("installed plugins also appear in the function-graph-scoped registry, alongside the static builtins", async () => {
    const client = makeClient(projectDir);
    const spec = baseSpec("plugin.httpRequestInGraph");

    const installRes = await client.installPlugin({ pluginJson: toBytes(spec) });
    expect(installRes.ok).toBe(true);

    const scoped = await client.getNodeRegistry({ scope: "function-graph" });
    const types = scoped.definitions.map((d) => d.type);
    expect(types).toContain("plugin.httpRequestInGraph");
    expect(types).toContain("logic.graphEntry");
  });

  it("returns ok:false (not a thrown error) on malformed JSON", async () => {
    const client = makeClient(projectDir);

    const res = await client.installPlugin({ pluginJson: toBytes("{ not valid json") });

    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/not valid JSON/i);
  });

  it("returns ok:false with descriptive errors for an invalid type prefix", async () => {
    const client = makeClient(projectDir);
    const spec = { ...baseSpec("notPlugin.httpRequest") };

    const res = await client.installPlugin({ pluginJson: toBytes(spec) });

    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('"type"'))).toBe(true);
  });

  it("returns ok:false with descriptive errors for an invalid category", async () => {
    const client = makeClient(projectDir);
    const spec: Record<string, unknown> = { ...baseSpec("plugin.badCategory"), category: "bogusCategory" };

    const res = await client.installPlugin({ pluginJson: toBytes(spec) });

    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('"category"'))).toBe(true);
  });

  it("returns ok:false with descriptive errors for an undeclared codegen placeholder", async () => {
    const client = makeClient(projectDir);
    const spec = baseSpec("plugin.badPlaceholder");
    spec.codegen.body = "const {{result}} = {{somethingUndeclared}};";

    const res = await client.installPlugin({ pluginJson: toBytes(spec) });

    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("somethingUndeclared"))).toBe(true);
  });

  it("rejects installing the same type twice", async () => {
    const client = makeClient(projectDir);
    const spec = baseSpec("plugin.duplicateTest");

    const first = await client.installPlugin({ pluginJson: toBytes(spec) });
    expect(first.ok).toBe(true);

    const second = await client.installPlugin({ pluginJson: toBytes(spec) });
    expect(second.ok).toBe(false);
    expect(second.errors.some((e) => e.includes("already registered"))).toBe(true);
  });
});

describe("loadInstalledPlugins", () => {
  it("returns empty result when .flowserver/plugins doesn't exist", async () => {
    const result = await loadInstalledPlugins(projectDir);
    expect(result).toEqual({ loaded: [], failed: [] });
  });

  it("re-registers a plugin from a pre-seeded .flowserver/plugins/*.node.json file (simulating a restart)", async () => {
    const spec = baseSpec("plugin.restartTest");
    const pluginsDir = path.join(projectDir, ".flowserver", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(path.join(pluginsDir, "plugin.restartTest.node.json"), JSON.stringify(spec, null, 2), "utf8");

    expect(getNodeDefinition("plugin.restartTest")).toBeUndefined();

    const result = await loadInstalledPlugins(projectDir);

    expect(result.loaded).toEqual(["plugin.restartTest"]);
    expect(result.failed).toEqual([]);
    expect(getNodeDefinition("plugin.restartTest")).toBeDefined();
  });

  it("records a failure for an invalid file without aborting the rest of the scan", async () => {
    const goodSpec = baseSpec("plugin.goodOne");
    const pluginsDir = path.join(projectDir, ".flowserver", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(path.join(pluginsDir, "plugin.goodOne.node.json"), JSON.stringify(goodSpec, null, 2), "utf8");
    writeFileSync(path.join(pluginsDir, "plugin.badOne.node.json"), "{ not valid json", "utf8");

    const result = await loadInstalledPlugins(projectDir);

    expect(result.loaded).toEqual(["plugin.goodOne"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].file).toBe("plugin.badOne.node.json");
  });
});
