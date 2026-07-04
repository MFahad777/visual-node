import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { encodeFlow } from "@flowserver/core";
import { EditorService } from "@flowserver/proto-gen";
import { buildApp } from "../../src/app.js";
import { helloWorldFlow } from "../fixtures.js";

/**
 * Real end-to-end coverage of the Connect transport wired into `buildApp()`: all six
 * per-group registration files (`src/connect/*.service.ts`) are mounted on ONE shared
 * `ConnectRouter` there, and two of them originally used `router.service(EditorService,
 * partial)` — which fills every method of `EditorService` NOT in that partial with an
 * "unimplemented" stub. Registering `.service()` twice for the same service on a shared
 * router meant the second call's stub-fill silently clobbered the first call's real
 * methods (confirmed by reading `@connectrpc/connect`'s `router.js` and
 * `@connectrpc/connect-express`'s path->handler `Map`, where the last registration for a
 * given path wins). Each service file's own isolated tests use `createRouterTransport()`
 * with a *fresh* router per test, so they could not catch this — only a test that
 * exercises every group through the *same* app/router the way `buildApp()` actually wires
 * them can. This file calls one RPC from each of the six groups (node-registry-flow,
 * validate-generate, run, files, compile-function-graph, plugins) through a real HTTP
 * server built from `buildApp()`, and would fail with a `Code.Unimplemented` error for any
 * group whose real implementation got clobbered.
 */

let projectDir: string;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "flowserver-connect-integration-"));
  const app = buildApp({ projectDir });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to bind a TCP port");
  }
  // Connect is mounted with requestPathPrefix: "/api" in app.ts, matching editor-ui's dev
  // proxy and browser client baseUrl — mirror that here.
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  rmSync(projectDir, { recursive: true, force: true });
});

function client() {
  const transport = createConnectTransport({ baseUrl, httpVersion: "1.1" });
  return createClient(EditorService, transport);
}

describe("Connect transport: all six service groups mounted on buildApp()'s shared router", () => {
  it("GetNodeRegistry (node-registry-flow group) returns real node definitions, not unimplemented", async () => {
    const res = await client().getNodeRegistry({});
    expect(res.definitions.length).toBeGreaterThan(0);
    expect(res.definitions.some((d) => d.type === "express.init")).toBe(true);
  });

  it("ValidateFlow (validate-generate group) validates a real flow, not unimplemented", async () => {
    const res = await client().validateFlow({ flatbufferFlow: encodeFlow(helloWorldFlow) });
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("GetRunStatus (run group) reports not-running for a fresh project, not unimplemented", async () => {
    const res = await client().getRunStatus({});
    expect(res.running).toBe(false);
  });

  it("ListFiles (files group) lists an empty fresh project tree, not unimplemented", async () => {
    const res = await client().listFiles({});
    expect(res.tree).toEqual([]);
  });

  it("PreviewFunctionGraph (compile-function-graph group) compiles a minimal graph, not unimplemented", async () => {
    const graphOnly = encodeFlow({
      version: "1",
      meta: { name: "preview", target: "express" },
      nodes: [],
      edges: [],
      variables: [],
    });
    const res = await client().previewFunctionGraph({ flatbufferFlow: graphOnly });
    expect(res.result.case).toBeDefined();
  });

  it("SaveFlow then GetFlow (node-registry-flow group) round-trips through the same router as the other groups", async () => {
    const c = client();
    const saveRes = await c.saveFlow({ flatbufferFlow: encodeFlow(helloWorldFlow) });
    expect(saveRes.ok).toBe(true);

    const getRes = await c.getFlow({});
    expect(getRes.found).toBe(true);
  });

  it("InstallPlugin (plugins group) rejects malformed JSON as data, not unimplemented", async () => {
    const res = await client().installPlugin({ pluginJson: new TextEncoder().encode("{ not valid json") });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
