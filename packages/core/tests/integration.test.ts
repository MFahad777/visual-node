import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import type { Flow } from "../src/schema/node.types.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = path.join(__dirname, "fixtures", "generated", "server.js");
// Distinct port + distinct generated dir from the hello-world test above — vitest runs test
// files in parallel, but both tests here live in the same file and run sequentially, so a
// shared port would still be safe; kept distinct anyway to match this repo's stated convention
// and to avoid any accidental interaction between the two generated projects.
const VARIABLES_PORT = 3993;
const VARIABLES_GENERATED_PATH = path.join(__dirname, "fixtures", "generated-variables", "server.js");
// Distinct from other core spawn-test ports: 3000, 3991-3997 are all taken by other test files
// (see the port-registry comments in branch-node.test.ts/switch-node.test.ts/etc.).
const BEGIN_PORT = 3998;
const BEGIN_GENERATED_PATH = path.join(__dirname, "fixtures", "generated-begin", "server.js");

afterAll(() => {
  rmSync(path.join(__dirname, "fixtures", "generated"), { recursive: true, force: true });
  rmSync(path.join(__dirname, "fixtures", "generated-variables"), { recursive: true, force: true });
  rmSync(path.join(__dirname, "fixtures", "generated-begin"), { recursive: true, force: true });
});

describe("end-to-end: flow.json -> server.js -> real HTTP request", () => {
  it("generates a server.js that actually runs and serves /hello", async () => {
    const flow: Flow = JSON.parse(
      readFileSync(path.join(__dirname, "fixtures", "hello-world.flow.json"), "utf8"),
    );

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    await writeGeneratedFile(GENERATED_PATH, formatted);

    // Real scaffolded projects ship their own package.json (CommonJS by default). Our test
    // fixture is nested under packages/core, whose package.json is "type": "module" — without
    // this, Node would walk up and misidentify the generated server.js as an ES module.
    writeFileSync(
      path.join(path.dirname(GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "hello-world-api", private: true }),
    );

    const child = spawn(process.execPath, [GENERATED_PATH], { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await waitForOutput(child, "Server running on port 3000", 10_000);

      const res = await fetch("http://localhost:3000/hello");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: "Hello World" });
    } finally {
      child.kill();
    }
  }, 15_000);
});

describe("end-to-end: Phase 10 variables — module-level state persists across real HTTP requests", () => {
  it("mutates a module-level `let` via variable.set and reads it back via variable.get, across separate requests to a real spawned server", async () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "variables-api", target: "express" },
      variables: [
        { id: "var1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" },
      ],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "route_inc", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/increment" } },
        {
          id: "var_set",
          type: "variable.set",
          position: { x: 0, y: 0 },
          // No wiring on the "value" pin: falls back to the raw-JS literal, same
          // "(counter + 1)" any hand-written increment would use.
          data: { variableId: "var1", literals: { value: "counter + 1" } },
        },
        { id: "handler_inc", type: "handler.sendJson", position: { x: 0, y: 0 }, data: { statusCode: 200, body: { ok: true } } },
        { id: "route_get", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/counter" } },
        { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "var1" } },
        // Exercises variable.get's resultIdentifier by wiring it into a value-consuming node
        // (same "Get -> Console Log" pattern proven in logic-nodes.test.ts) before responding
        // with the module-level variable directly (handler.sendJson can't reference a dynamic
        // value, only a static JSON literal).
        { id: "log_get", type: "debug.consoleLog", position: { x: 0, y: 0 }, data: {} },
        { id: "handler_get", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.status(200).json({ counter });" } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: VARIABLES_PORT } },
      ],
      edges: [
        { id: "e1", source: "init", target: "route_inc", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "route_inc", target: "var_set", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "var_set", target: "handler_inc", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "init", target: "route_get", sourceHandle: "out", targetHandle: "in" },
        { id: "e5", source: "route_get", target: "log_get", sourceHandle: "out", targetHandle: "in" },
        { id: "e6", source: "var_get", target: "log_get", sourceHandle: "value", targetHandle: "value" },
        { id: "e7", source: "log_get", target: "handler_get", sourceHandle: "out", targetHandle: "in" },
        { id: "e8", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    expect(formatted).toContain("let counter = 0;");
    await writeGeneratedFile(VARIABLES_GENERATED_PATH, formatted);
    writeFileSync(
      path.join(path.dirname(VARIABLES_GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "variables-api", private: true }),
    );

    const child = spawn(process.execPath, [VARIABLES_GENERATED_PATH], { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await waitForOutput(child, `Server running on port ${VARIABLES_PORT}`, 10_000);

      const initial = await fetch(`http://localhost:${VARIABLES_PORT}/counter`);
      expect(await initial.json()).toEqual({ counter: 0 });

      const inc1 = await fetch(`http://localhost:${VARIABLES_PORT}/increment`);
      expect(inc1.status).toBe(200);
      const inc2 = await fetch(`http://localhost:${VARIABLES_PORT}/increment`);
      expect(inc2.status).toBe(200);

      // Proves real, persistent module-level state: two independent requests to /increment
      // both mutated the SAME `counter` binding, not a per-request-scoped one.
      const after = await fetch(`http://localhost:${VARIABLES_PORT}/counter`);
      expect(await after.json()).toEqual({ counter: 2 });
    } finally {
      child.kill();
    }
  }, 15_000);
});

describe("end-to-end: Phase 11 Begin — module-scope setup runs once at load", () => {
  it("gives a const variable its value via a Begin-driven Set node, visible to the very first real HTTP request", async () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "begin-api", target: "express" },
      variables: [
        // No defaultValue: Begin's Set node is this variable's ONLY declaration+initialization
        // point — proves Begin ran before the route handler ever read it.
        { id: "var1", name: "DIR", keyword: "const", dataType: "string" },
      ],
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "begin", type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: "var_set",
          type: "variable.set",
          position: { x: 0, y: 0 },
          data: { variableId: "var1", literals: { value: "/srv/app" } },
        },
        { id: "route_config", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/config" } },
        { id: "handler_config", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.status(200).json({ dir: DIR });" } },
        { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: BEGIN_PORT } },
      ],
      edges: [
        { id: "e1", source: "begin", target: "var_set", sourceHandle: "out", targetHandle: "in" },
        { id: "e2", source: "init", target: "route_config", sourceHandle: "out", targetHandle: "in" },
        { id: "e3", source: "route_config", target: "handler_config", sourceHandle: "out", targetHandle: "in" },
        { id: "e4", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
      ],
    };

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);
    expect(formatted).toContain('const DIR = "/srv/app";');
    await writeGeneratedFile(BEGIN_GENERATED_PATH, formatted);
    writeFileSync(
      path.join(path.dirname(BEGIN_GENERATED_PATH), "package.json"),
      JSON.stringify({ name: "begin-api", private: true }),
    );

    const child = spawn(process.execPath, [BEGIN_GENERATED_PATH], { stdio: ["ignore", "pipe", "pipe"] });

    try {
      await waitForOutput(child, `Server running on port ${BEGIN_PORT}`, 10_000);

      // The very first request to this freshly spawned server already sees the Begin-set
      // value — proving it ran once at module load, not lazily on first use.
      const res = await fetch(`http://localhost:${BEGIN_PORT}/config`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ dir: "/srv/app" });
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
