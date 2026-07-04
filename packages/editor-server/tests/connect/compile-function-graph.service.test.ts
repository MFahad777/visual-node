import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { EditorService } from "@visual-node/proto-gen";
import { encodeFlow, type Flow, type FlowNode } from "@visual-node/core";
import { registerCompileFunctionGraphRoutes } from "../../src/connect/compile-function-graph.service.js";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "flowserver-connect-test-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * In-memory client for `EditorService`, routed straight to this file's registration
 * function via Connect's `createRouterTransport` — no HTTP server, no `app.ts`
 * integration, per the "impractical without full app.ts integration" fallback plan.
 */
function client() {
  const transport = createRouterTransport((router) => registerCompileFunctionGraphRoutes(router, { projectDir }));
  return createClient(EditorService, transport);
}

const dateFormaterFlow: Flow = {
  version: "1",
  meta: { name: "dateFormater", target: "express" },
  nodes: [
    {
      id: "fn1",
      type: "logic.function",
      position: { x: 0, y: 0 },
      data: { name: "formatDate", params: "date", body: "return date.toISOString().slice(0, 10);" },
    },
    { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [{ id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" }],
  variables: [],
};

function serverFlow(port: number, requirePath = "../helpers/dateFormater", sourceType: "local" | "npm" = "local"): Flow {
  return {
    version: "1",
    meta: { name: "server", target: "express" },
    nodes: [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data:
          sourceType === "npm"
            ? { sourceType: "npm", path: requirePath, variableName: "dateHelper" }
            : { path: requirePath, variableName: "dateHelper" },
      },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/today" } },
      {
        id: "handler",
        type: "handler.customCode",
        position: { x: 0, y: 0 },
        data: { code: "const today = dateHelper.formatDate(new Date());\nres.json({ today });" },
      },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
    ],
    edges: [
      { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "route", target: "handler", sourceHandle: "out", targetHandle: "in" },
      { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
    ],
    variables: [],
  };
}

function writeBlueprint(relativePath: string, flow: Flow): void {
  const absolute = path.join(projectDir, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, encodeFlow(flow));
}

/** Encodes a Function-node blueprint sub-graph (`{ nodes, edges }`, no top-level `meta`/
 * `version` of its own) into the FlatBuffers bytes `PreviewFunctionGraphRequest` carries.
 * `encodeFlow` requires a full `Flow` shape, so placeholder `version`/`meta` are filled in
 * here and discarded server-side after decoding — only `.nodes`/`.edges` are used. */
function encodeGraph(nodes: FlowNode[], edges: Flow["edges"]): Uint8Array {
  return encodeFlow({ version: "1", meta: { name: "preview", target: "express" }, nodes, edges, variables: [] });
}

function graphEntry(id: string): FlowNode {
  return { id, type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} };
}

function graphReturn(id: string): FlowNode {
  return { id, type: "logic.graphReturn", position: { x: 0, y: 0 }, data: {} };
}

function addNode(id: string): FlowNode {
  return { id, type: "operators.add", position: { x: 0, y: 0 }, data: {} };
}

describe("CompileProject RPC", () => {
  it("returns valid:true with a compiled result per file for a valid two-file project", async () => {
    writeBlueprint("helpers/dateFormater.blueprint", dateFormaterFlow);
    writeBlueprint("src/server.blueprint", serverFlow(3910));

    const res = await client().compileProject({});

    expect(res.valid).toBe(true);
    const paths = res.results.map((f) => f.relativePath).sort();
    expect(paths).toEqual(["helpers/dateFormater.js", "src/server.js"]);
    const serverFile = res.results.find((f) => f.relativePath === "src/server.js");
    expect(serverFile?.code).toContain("dateHelper");
  });

  it("returns valid:false with a matching error when a logic.require path doesn't resolve", async () => {
    writeBlueprint("helpers/dateFormater.blueprint", dateFormaterFlow);
    writeBlueprint("src/server.blueprint", serverFlow(3911, "../helpers/nonexistent"));

    const res = await client().compileProject({});

    expect(res.valid).toBe(false);
    expect(res.results).toEqual([]);
    expect(res.errors.some((e) => e.message.includes("does not resolve to any"))).toBe(true);
  });

  it("treats an unparsable blueprint file as a per-file error instead of erroring the RPC", async () => {
    const absolute = path.join(projectDir, "broken.blueprint");
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, "{ not valid json", "utf8");

    const res = await client().compileProject({});

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.relativePath === "broken.blueprint")).toBe(true);
  });
});

describe("WriteCompiledProject RPC", () => {
  it("refuses to write an invalid project", async () => {
    writeBlueprint("src/server.blueprint", serverFlow(3912, "../helpers/nonexistent"));

    const res = await client().writeCompiledProject({});

    expect(res.valid).toBe(false);
    expect(res.written).toBe(false);
    expect(existsSync(path.join(projectDir, "src", "server.js"))).toBe(false);
  });

  it("writes every compiled file to disk, mirroring the source tree", async () => {
    writeBlueprint("helpers/dateFormater.blueprint", dateFormaterFlow);
    writeBlueprint("src/server.blueprint", serverFlow(3913));

    const res = await client().writeCompiledProject({});

    expect(res.valid).toBe(true);
    expect(res.written).toBe(true);
    const outPaths = res.files.map((f) => f.relativePath).sort();
    expect(outPaths).toEqual(["helpers/dateFormater.js", "src/server.js"]);
    for (const f of res.files) {
      expect(f.outputPath).toBe(f.relativePath);
    }

    const helperOnDisk = readFileSync(path.join(projectDir, "helpers", "dateFormater.js"), "utf8");
    expect(helperOnDisk).toContain("formatDate");
    const serverOnDisk = readFileSync(path.join(projectDir, "src", "server.js"), "utf8");
    expect(serverOnDisk).toContain("dateHelper");

    const pkg = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.dependencies).toEqual({ express: expect.any(String) });
  });

  it("includes an npm-mode logic.require node's package alongside express in package.json", async () => {
    writeBlueprint("src/server.blueprint", serverFlow(3914, "axios", "npm"));

    const res = await client().writeCompiledProject({});

    expect(res.valid).toBe(true);
    const pkg = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.dependencies).toEqual({ express: expect.any(String), axios: "*" });
  });

  it("preserves a pre-existing hand-edited package.json's extra fields and doesn't downgrade a pinned version", async () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        private: true,
        scripts: { start: "node src/server.js" },
        dependencies: { express: "^4.19.2", axios: "^0.27.0" },
      }),
    );
    writeBlueprint("src/server.blueprint", serverFlow(3915, "axios", "npm"));

    const res = await client().writeCompiledProject({});

    expect(res.valid).toBe(true);
    const pkg = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.scripts).toEqual({ start: "node src/server.js" });
    expect(pkg.dependencies.axios).toBe("^0.27.0");
    expect(pkg.dependencies.express).toBe("^4.19.2");
  });
});

describe("PreviewFunctionGraph RPC", () => {
  it("returns a body result for a valid param -> return graph", async () => {
    const nodes = [graphEntry("entry1"), graphReturn("ret1")];
    const edges = [{ id: "e1", source: "entry1", target: "ret1", sourceHandle: "x", targetHandle: "value" }];

    const res = await client().previewFunctionGraph({ flatbufferFlow: encodeGraph(nodes, edges) });

    expect(res.result.case).toBe("body");
    expect(res.result.value).toBe("return x;");
  });

  it("returns an error result with a non-empty message for a cyclic graph", async () => {
    const nodes = [addNode("add1"), addNode("add2")];
    const edges = [
      { id: "e1", source: "add1", target: "add2", sourceHandle: "result", targetHandle: "a" },
      { id: "e2", source: "add2", target: "add1", sourceHandle: "result", targetHandle: "b" },
    ];

    const res = await client().previewFunctionGraph({ flatbufferFlow: encodeGraph(nodes, edges) });

    expect(res.result.case).toBe("error");
    if (res.result.case === "error") {
      expect(typeof res.result.value.message).toBe("string");
      expect(res.result.value.message.length).toBeGreaterThan(0);
    }
  });

  it("returns a body result (empty statements) for an empty graph instead of erroring", async () => {
    const res = await client().previewFunctionGraph({ flatbufferFlow: encodeGraph([], []) });

    expect(res.result.case).toBe("body");
  });
});
