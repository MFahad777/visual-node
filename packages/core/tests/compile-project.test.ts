import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compileProject } from "../src/project/compile-project.js";
import { writeGeneratedFile } from "../src/codegen/file-writer.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import type { Flow } from "../src/schema/node.types.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, "fixtures", "generated-project");
const PORT = 3997; // distinct from integration.test.ts's 3000 — vitest runs test files in parallel

afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

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
    { id: "var_get", type: "variable.get", position: { x: 0, y: 0 }, data: { variableId: "v1" } },
    { id: "exp1", type: "logic.export", position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [
    { id: "e1", source: "fn1", target: "exp1", sourceHandle: "out", targetHandle: "in" },
    { id: "e2", source: "var_get", target: "exp1", sourceHandle: "value", targetHandle: "variables" },
  ],
  variables: [{ id: "v1", name: "appVersion", keyword: "let", dataType: "string", defaultValue: "1.0.0" }],
};

function serverFlow(port: number): Flow {
  return {
    version: "1",
    meta: { name: "server", target: "express" },
    nodes: [
      { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { path: "../helpers/dateFormater", variableName: "dateHelper" },
      },
      { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: { method: "GET", path: "/today" } },
      {
        id: "hf1",
        type: "logic.handlerFunction",
        position: { x: 0, y: 0 },
        data: {
          name: "handler",
          mode: "code",
          body: "const today = dateHelper.formatDate(new Date());\nres.json({ today, version: dateHelper.appVersion });",
        },
      },
      { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port } },
    ],
    edges: [
      { id: "e1", source: "init", target: "route", sourceHandle: "out", targetHandle: "in" },
      { id: "e2", source: "route", target: "hf1", sourceHandle: "out", targetHandle: "in" },
      { id: "e3", source: "init", target: "listen", sourceHandle: "out", targetHandle: "in" },
    ],
  };
}

describe("compileProject — multi-file, cross-file require()", () => {
  it("rejects a require() path that doesn't resolve to a project file", async () => {
    const result = await compileProject([
      {
        relativePath: "src/server.blueprint",
        flow: {
          ...serverFlow(PORT),
          nodes: serverFlow(PORT).nodes.map((n) =>
            n.id === "req1" ? { ...n, data: { path: "../helpers/nonexistent", variableName: "x" } } : n,
          ),
        },
      },
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.message.includes("does not resolve to any"))).toBe(true);
    }
  });

  it("does not reject an npm-mode require() path even though it isn't a real .blueprint file", async () => {
    const result = await compileProject([
      {
        relativePath: "src/server.blueprint",
        flow: {
          ...serverFlow(PORT),
          nodes: serverFlow(PORT).nodes.map((n) =>
            n.id === "req1" ? { ...n, data: { sourceType: "npm", path: "axios", variableName: "axios" } } : n,
          ),
        },
      },
    ]);

    if (!result.valid) {
      expect(result.errors.some((e) => e.message.includes("does not resolve to any"))).toBe(false);
    }
  });

  it("rejects an npm-mode require() node with an invalid npm package name, attributed to its nodeId", async () => {
    const result = await compileProject([
      {
        relativePath: "src/server.blueprint",
        flow: {
          ...serverFlow(PORT),
          nodes: serverFlow(PORT).nodes.map((n) =>
            n.id === "req1" ? { ...n, data: { sourceType: "npm", path: "Not A Valid Name!", variableName: "x" } } : n,
          ),
        },
      },
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const err = result.errors.find((e) => e.nodeId === "req1");
      expect(err).toBeTruthy();
      expect(err?.message).toContain("invalid npm package name");
    }
  });

  it(
    "compiles two files, writes them mirroring the source tree, and the compiled server actually runs, requires the compiled helper, and reads its exported variable",
    async () => {
      const result = await compileProject([
        { relativePath: "helpers/dateFormater.blueprint", flow: dateFormaterFlow },
        { relativePath: "src/server.blueprint", flow: serverFlow(PORT) },
      ]);

      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(result.files.map((f) => f.relativePath).sort()).toEqual(["helpers/dateFormater.js", "src/server.js"]);

      for (const file of result.files) {
        await writeGeneratedFile(path.join(GENERATED_DIR, file.relativePath), file.code);
      }
      // Real scaffolded projects ship their own CommonJS package.json — see integration.test.ts.
      writeFileSync(path.join(GENERATED_DIR, "package.json"), JSON.stringify({ name: "generated-project", private: true }));

      const serverPath = path.join(GENERATED_DIR, "src", "server.js");
      const child = spawn(process.execPath, [serverPath], { stdio: ["ignore", "pipe", "pipe"] });

      try {
        await waitForOutput(child, `Server running on port ${PORT}`, 10_000);

        const res = await fetch(`http://localhost:${PORT}/today`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.version).toBe("1.0.0");
      } finally {
        child.kill();
      }
    },
    15_000,
  );
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
