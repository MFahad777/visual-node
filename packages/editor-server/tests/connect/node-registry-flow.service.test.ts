import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { decodeFlow, encodeFlow, type Flow } from "@visual-node/core";
import { EditorService } from "@visual-node/proto-gen";
import { registerNodeRegistryFlowRoutes } from "../../src/connect/node-registry-flow.service.js";

// Exercises registerNodeRegistryFlowRoutes() directly against an in-memory
// createRouterTransport() (no HTTP server, no app.ts integration needed — app.ts's final
// mounting of all Connect service groups together is owned elsewhere per this task's
// scope). This mirrors the same "real spawn"-style philosophy as the REST route tests
// (flow.routes.test.ts, nodes.routes.test.ts) but over the Connect protocol.

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "visual-node-connect-test-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function makeClient(dir: string) {
  const transport = createRouterTransport((router) => {
    registerNodeRegistryFlowRoutes(router, { projectDir: dir });
  });
  return createClient(EditorService, transport);
}

const sampleFlow: Flow = {
  version: "1",
  meta: { name: "test-app", target: "express" },
  nodes: [{ id: "init_1", type: "express.init", position: { x: 0, y: 0 }, data: {} }],
  edges: [],
  variables: [],
};

describe("GetNodeRegistry (Connect)", () => {
  it("returns the same 50 built-ins as GET /api/node-registry, without emit, with defaults preserved", async () => {
    const client = makeClient(projectDir);
    const res = await client.getNodeRegistry({});

    // 54, not 50: `logic.graphReturn` ("Return") became a legitimate main-canvas node type
    // in Phase 17 — wired inside a loop node's "Loop Body" arm to produce that iteration's
    // return value (see FUNCTION_GRAPH_ONLY_TYPES's doc comment in
    // nodes/function-graph-nodes.ts). Only `logic.graphEntry` remains function-graph-only.
    // Phase 18 added one more builtin, `logic.pathExtractor`. Phase 20 added `logic.callback`.
    // Phase 24 replaced `handler.customCode` with `logic.handlerFunction` (net count unchanged).
    // Added `logic.promise` for async-result handling.
    expect(res.definitions).toHaveLength(54);
    const types = res.definitions.map((d) => d.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "express.init",
        "express.listen",
        "logic.handlerFunction",
        "logic.function",
        "logic.graphReturn",
        "controlFlow.branch",
        "controlFlow.switch",
        "variable.get",
        "variable.set",
        "logic.begin",
        "array.map",
        "array.push",
      ]),
    );

    expect(types).not.toContain("logic.graphEntry");

    // No `emit`/`resultIdentifier` function fields survive onto the wire type at all
    // (they're not part of the proto message), and a numeric ConfigField default
    // (express.listen's `port: 3000`) round-trips through the google.protobuf.Value oneof.
    const listen = res.definitions.find((d) => d.type === "express.listen");
    expect(listen).toBeDefined();
    const portField = listen!.configSchema.find((f) => f.key === "port");
    expect(portField).toBeDefined();
    expect(portField!.defaultValue?.kind.case).toBe("numberValue");
    expect(portField!.defaultValue?.kind.value).toBe(3000);
  });

  it("?scope=function-graph mirrors the restricted registry", async () => {
    const client = makeClient(projectDir);
    const res = await client.getNodeRegistry({ scope: "function-graph" });

    // 45: Phase 24 removed `handler.customCode` (was function-graph-usable) and
    // added `handler.sendJson` (now function-graph-usable too). Added `logic.promise`
    // for async-result handling.
    expect(res.definitions).toHaveLength(45);
    const types = res.definitions.map((d) => d.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "logic.graphEntry",
        "logic.graphReturn",
        "controlFlow.branch",
        "variable.get",
        "variable.set",
        "array.map",
        "handler.sendJson",
      ]),
    );
    expect(types).not.toContain("express.init");
    // Handler Function is a standalone top-level declaration (like logic.function), never
    // nestable inside another graph — locks in Phase 24's "not nestable" design decision as a
    // wire-protocol regression test.
    expect(types).not.toContain("logic.handlerFunction");
  });
});

describe("GetFlow / SaveFlow (Connect)", () => {
  it("GetFlow returns found=false for a fresh project directory, mirroring GET /api/flow's { flow: null }", async () => {
    const client = makeClient(projectDir);
    const res = await client.getFlow({});
    expect(res.found).toBe(false);
    expect(res.flatbufferFlow).toHaveLength(0);
  });

  it("round-trips a flow through SaveFlow -> GetFlow", async () => {
    const client = makeClient(projectDir);

    const saveRes = await client.saveFlow({ flatbufferFlow: encodeFlow(sampleFlow) });
    expect(saveRes.ok).toBe(true);

    const getRes = await client.getFlow({});
    expect(getRes.found).toBe(true);
    expect(decodeFlow(getRes.flatbufferFlow)).toEqual(sampleFlow);
  });

  it("writes flow.json as plain JSON on disk, same path/format as the REST route", async () => {
    const client = makeClient(projectDir);
    await client.saveFlow({ flatbufferFlow: encodeFlow(sampleFlow) });

    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(path.join(projectDir, "flow.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(sampleFlow);
  });

  it("rejects GetFlow when flow.json on disk is not valid JSON, mirroring the REST route's 500", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(path.join(projectDir, "flow.json"), "{ not valid json", "utf8");

    const client = makeClient(projectDir);
    await expect(client.getFlow({})).rejects.toThrow(/not valid JSON/);
  });
});
