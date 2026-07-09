import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { encodeFlow, type Flow } from "@visual-node/core";
import { EditorService } from "@visual-node/proto-gen";
import { registerValidateGenerateRoutes } from "../../src/connect/validate-generate.service.js";
import { helloWorldFlow, makeHelloWorldFlow, routeWithNoHandlerFlow } from "../fixtures.js";

// Different port from generate.routes.test.ts (3000) and run.routes.test.ts (3001) — vitest
// runs test files in parallel, and two real `node server.js` processes on the same port
// would race with EADDRINUSE (same rationale documented in tests/fixtures.ts).
const WRITE_TEST_PORT = 3002;

/** `helloWorldFlow`, plus an npm-mode logic.require node so a dependency actually gets collected. */
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
  projectDir = mkdtempSync(path.join(os.tmpdir(), "visual-node-connect-test-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * Builds an in-memory Connect client wired directly to `registerValidateGenerateRoutes`
 * via `createRouterTransport` — no HTTP server, no `buildApp()` — since this file's job is
 * to implement 3 of EditorService's RPCs, not to own final `app.ts` wiring (that's someone
 * else's in-progress integration work, per the task's scope). This mirrors the same
 * "compile then verify the emitted code" philosophy as generate.routes.test.ts.
 */
function clientFor(dir: string) {
  const transport = createRouterTransport((router) => {
    registerValidateGenerateRoutes(router, { projectDir: dir });
  });
  return createClient(EditorService, transport);
}

describe("ValidateFlow (Connect)", () => {
  it("returns valid: true, errors: [] for a valid flow", async () => {
    const client = clientFor(projectDir);
    const res = await client.validateFlow({ flatbufferFlow: encodeFlow(helloWorldFlow) });

    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("returns valid: false with errors for an invalid flow (still a normal response, not an RPC error)", async () => {
    const client = clientFor(projectDir);
    const res = await client.validateFlow({ flatbufferFlow: encodeFlow(routeWithNoHandlerFlow) });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("no handler attached"))).toBe(true);
  });

  // decodeFlow validates the FlatBuffers file identifier up front (hardened during the
  // storage-cutover step — see packages/core/src/serialization/flatbuffer-flow.ts) rather
  // than silently returning an empty-shaped Flow for garbage input, so decodeFlowOrThrow's
  // try/catch here is a real, exercised path, not defensive-only.
  it("rejects a garbage byte payload with InvalidArgument instead of decoding it leniently", async () => {
    const client = clientFor(projectDir);
    await expect(client.validateFlow({ flatbufferFlow: new Uint8Array([1, 2, 3, 4]) })).rejects.toThrow(
      /could not be decoded/,
    );
  });
});

describe("GenerateCode (Connect)", () => {
  it("returns formatted code for a valid flow", async () => {
    const client = clientFor(projectDir);
    const res = await client.generateCode({ flatbufferFlow: encodeFlow(helloWorldFlow) });

    expect(res.valid).toBe(true);
    expect(res.code).toContain('app.get("/hello"');
    expect(res.code).toContain("Hello World");
  });

  it("returns valid: false with validation errors for an invalid flow (no RPC error)", async () => {
    const client = clientFor(projectDir);
    const res = await client.generateCode({ flatbufferFlow: encodeFlow(routeWithNoHandlerFlow) });

    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.code).toBe("");
  });
});

describe("WriteGeneratedCode (Connect)", () => {
  it("refuses to write an invalid flow", async () => {
    const client = clientFor(projectDir);
    const res = await client.writeGeneratedCode({ flatbufferFlow: encodeFlow(routeWithNoHandlerFlow) });

    expect(res.valid).toBe(false);
    expect(res.written).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("writes a server.js and package.json that actually run and serve /hello", async () => {
    const flow = makeHelloWorldFlow(WRITE_TEST_PORT);
    const client = clientFor(projectDir);
    const res = await client.writeGeneratedCode({ flatbufferFlow: encodeFlow(flow) });

    expect(res.valid).toBe(true);
    expect(res.written).toBe(true);

    const serverPath = path.join(projectDir, "server.js");
    const pkgPath = path.join(projectDir, "package.json");
    expect(res.path).toBe(serverPath);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    expect(pkg.dependencies).toEqual({ express: expect.any(String) });

    // Real dependency install would be too slow/networked for a unit test; symlink the
    // monorepo's already-installed express so `require("express")` resolves exactly as it
    // would once a user runs `npm install` — same technique as generate.routes.test.ts.
    const { symlinkSync, mkdirSync } = await import("node:fs");
    const nodeModulesDir = path.join(projectDir, "node_modules");
    mkdirSync(nodeModulesDir, { recursive: true });
    const expressSource = path.resolve(process.cwd(), "node_modules", "express");
    symlinkSync(expressSource, path.join(nodeModulesDir, "express"), "junction");

    const child = spawn(process.execPath, [serverPath], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await waitForOutput(child, `Server running on port ${WRITE_TEST_PORT}`, 10_000);
      const httpRes = await fetch(`http://localhost:${WRITE_TEST_PORT}/hello`);
      expect(httpRes.status).toBe(200);
      expect(await httpRes.json()).toEqual({ message: "Hello World" });
    } finally {
      child.kill();
    }
  }, 15_000);

  it("includes an npm-mode logic.require node's package alongside express in package.json", async () => {
    const flow = flowWithNpmRequire(3020);
    const client = clientFor(projectDir);
    const res = await client.writeGeneratedCode({ flatbufferFlow: encodeFlow(flow) });

    expect(res.valid).toBe(true);
    expect(res.written).toBe(true);

    const pkg = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.dependencies).toEqual({ express: expect.any(String), axios: "^1.7.0" });
  });

  it("preserves a pre-existing hand-edited package.json's extra fields and doesn't downgrade a pinned version", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        private: true,
        scripts: { start: "node server.js" },
        dependencies: { express: "^4.19.2", axios: "^0.27.0" },
      }),
    );

    const flow = flowWithNpmRequire(3021);
    const client = clientFor(projectDir);
    const res = await client.writeGeneratedCode({ flatbufferFlow: encodeFlow(flow) });

    expect(res.valid).toBe(true);

    const pkg = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.scripts).toEqual({ start: "node server.js" });
    // The npm-mode require node declares "^1.7.0", but the hand-pinned "^0.27.0" must win.
    expect(pkg.dependencies.axios).toBe("^0.27.0");
    expect(pkg.dependencies.express).toBe("^4.19.2");
  });
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
