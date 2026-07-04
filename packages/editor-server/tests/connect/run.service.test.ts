import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { encodeFlow, type Flow } from "@flowserver/core";
import { EditorService } from "@flowserver/proto-gen";
import { registerRunRoutes } from "../../src/connect/run.service.js";
import { serverRunner } from "../../src/runner.js";
import { makeHelloWorldFlow, routeWithNoHandlerFlow } from "../fixtures.js";

// Distinct from generate.routes.test.ts (3000), run.routes.test.ts (3001), and
// validate-generate.service.test.ts (3002) — vitest runs test files in parallel, and two
// real `node server.js` processes on the same port would race with EADDRINUSE (same
// rationale documented in tests/fixtures.ts).
const RUN_TEST_PORT = 3003;
const helloWorldFlow = makeHelloWorldFlow(RUN_TEST_PORT);

/** `helloWorldFlow`, plus an npm-mode logic.require node so a second missing package shows up. */
function flowWithNpmRequire(port: number): Flow {
  const base = makeHelloWorldFlow(port);
  return {
    ...base,
    nodes: [
      ...base.nodes,
      {
        id: "req_npm_1",
        type: "logic.require",
        position: { x: 0, y: 400 },
        data: { sourceType: "npm", path: "axios", variableName: "axios", version: "^1.7.0" },
      },
    ],
  };
}

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "flowserver-connect-run-test-"));
});

afterEach(async () => {
  await serverRunner.stop();
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * Builds an in-memory Connect client wired directly to `registerRunRoutes` via
 * `createRouterTransport` — no HTTP server, no `buildApp()`, matching the same
 * philosophy as `validate-generate.service.test.ts` (final `app.ts` wiring is someone
 * else's in-progress integration work, per this task's scope).
 */
function clientFor(dir: string) {
  const transport = createRouterTransport((router) => {
    registerRunRoutes(router, { projectDir: dir });
  });
  return createClient(EditorService, transport);
}

/** "Run Server" always compiles the project from disk, so tests write a ".blueprint" source first. */
function writeBlueprint(dir: string, relativePath: string, flow: Flow): void {
  const absolute = path.join(dir, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, encodeFlow(flow));
}

function installExpress(dir: string) {
  const nodeModulesDir = path.join(dir, "node_modules");
  mkdirSync(nodeModulesDir, { recursive: true });
  const expressSource = path.resolve(process.cwd(), "node_modules", "express");
  symlinkSync(expressSource, path.join(nodeModulesDir, "express"), "junction");
}

function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for condition"));
      setTimeout(check, 50);
    };
    check();
  });
}

describe("StartRun (Connect)", () => {
  it("returns a validationFailure result for an invalid flow and does not start anything", async () => {
    writeBlueprint(projectDir, "server.blueprint", routeWithNoHandlerFlow);
    const client = clientFor(projectDir);

    const res = await client.startRun({});

    expect(res.result.case).toBe("validationFailure");
    if (res.result.case === "validationFailure") {
      expect(res.result.value.errors.length).toBeGreaterThan(0);
    }
    expect(serverRunner.running).toBe(false);
  });

  it("returns an error result when no file in the project calls express.listen", async () => {
    const client = clientFor(projectDir);

    const res = await client.startRun({});

    expect(res.result.case).toBe("error");
    if (res.result.case === "error") {
      expect(res.result.value).toContain("express.listen");
    }
    expect(serverRunner.running).toBe(false);
  });

  it("returns an error result with a helpful message when dependencies are not installed", async () => {
    writeBlueprint(projectDir, "server.blueprint", helloWorldFlow);
    const client = clientFor(projectDir);

    const res = await client.startRun({});

    expect(res.result.case).toBe("error");
    if (res.result.case === "error") {
      expect(res.result.value).toContain("npm install");
    }
    expect(serverRunner.running).toBe(false);
  });

  it("lists every missing package (including npm-mode logic.require dependencies) in the error message", async () => {
    writeBlueprint(projectDir, "server.blueprint", flowWithNpmRequire(3010));
    const client = clientFor(projectDir);

    const res = await client.startRun({});

    expect(res.result.case).toBe("error");
    if (res.result.case === "error") {
      expect(res.result.value).toContain("npm install");
      expect(res.result.value).toContain("express");
      expect(res.result.value).toContain("axios");
    }
    expect(serverRunner.running).toBe(false);
  });
});

describe("run lifecycle: StartRun -> GetRunStatus -> StopRun (Connect)", () => {
  it("actually spawns the generated server and serves /hello, then stops it", async () => {
    writeBlueprint(projectDir, "server.blueprint", helloWorldFlow);
    installExpress(projectDir);
    const client = clientFor(projectDir);

    const startRes = await client.startRun({});
    expect(startRes.result.case).toBe("started");
    if (startRes.result.case === "started") {
      expect(startRes.result.value.running).toBe(true);
    }
    expect(serverRunner.running).toBe(true);

    await waitUntil(() => serverRunner.getBufferedLogs().some((l) => l.includes(`Server running on port ${RUN_TEST_PORT}`))).catch(
      (err) => {
        throw new Error(`${err.message}. Buffered logs: ${JSON.stringify(serverRunner.getBufferedLogs())}`);
      },
    );

    const statusRes = await client.getRunStatus({});
    expect(statusRes.running).toBe(true);

    const helloRes = await fetch(`http://localhost:${RUN_TEST_PORT}/hello`);
    expect(helloRes.status).toBe(200);
    expect(await helloRes.json()).toEqual({ message: "Hello World" });

    const stopRes = await client.stopRun({});
    expect(stopRes.running).toBe(false);
    expect(serverRunner.running).toBe(false);
  }, 15_000);
});

describe("RunLogs (Connect server-streaming)", () => {
  it("replays buffered logs then streams live log lines, ending cleanly when the consumer stops pulling", async () => {
    writeBlueprint(projectDir, "server.blueprint", helloWorldFlow);
    installExpress(projectDir);
    const client = clientFor(projectDir);

    await client.startRun({});

    const collected: string[] = [];
    for await (const msg of client.runLogs({})) {
      if (msg.event.case === "log") {
        collected.push(msg.event.value);
        if (collected.some((l) => l.includes(`Server running on port ${RUN_TEST_PORT}`))) {
          // Breaking out of a `for await` loop calls the async iterator's `.return()`,
          // exercising the same generator-cleanup path as a client that simply stops
          // pulling (as opposed to an explicit AbortSignal cancellation, covered below).
          break;
        }
      }
    }

    expect(collected.some((l) => l.includes(`Server running on port ${RUN_TEST_PORT}`))).toBe(true);
  }, 15_000);

  it("stops cleanly and unblocks the consumer when the caller aborts via CallOptions.signal", async () => {
    writeBlueprint(projectDir, "server.blueprint", helloWorldFlow);
    installExpress(projectDir);
    const client = clientFor(projectDir);

    await client.startRun({});
    await waitUntil(() => serverRunner.getBufferedLogs().length > 0);

    const controller = new AbortController();
    const collected: string[] = [];

    const consume = (async () => {
      try {
        for await (const msg of client.runLogs({}, { signal: controller.signal })) {
          if (msg.event.case === "log") collected.push(msg.event.value);
        }
      } catch {
        // Cancellation may surface as a thrown ConnectError(Code.Canceled) depending on
        // the transport — either a clean loop exit or a Canceled error both prove the
        // stream actually stopped instead of hanging forever.
      }
    })();

    // Give the generator a moment to replay buffered lines and start waiting on live
    // events, then cancel — this is the path that must resolve `run.service.ts`'s
    // internal `wake` promise via the "abort" listener rather than hanging indefinitely.
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();

    await Promise.race([
      consume,
      new Promise((_, reject) => setTimeout(() => reject(new Error("RunLogs did not stop within 2s of abort")), 2000)),
    ]);

    expect(collected.length).toBeGreaterThan(0);
  }, 10_000);

  it("emits an exit event when the running server is stopped", async () => {
    writeBlueprint(projectDir, "server.blueprint", helloWorldFlow);
    installExpress(projectDir);
    const client = clientFor(projectDir);

    await client.startRun({});
    await waitUntil(() => serverRunner.getBufferedLogs().some((l) => l.includes(`Server running on port ${RUN_TEST_PORT}`)));

    const controller = new AbortController();
    let sawExit = false;

    const consume = (async () => {
      for await (const msg of client.runLogs({}, { signal: controller.signal })) {
        if (msg.event.case === "exit") {
          sawExit = true;
          break;
        }
      }
    })();

    // Stop the server shortly after subscribing so the live "exit" event (not a buffered
    // line) is what the stream delivers.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.stopRun({});

    await Promise.race([
      consume,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Did not observe an exit event within 5s")), 5000)),
    ]);
    controller.abort();

    expect(sawExit).toBe(true);
  }, 15_000);
});
