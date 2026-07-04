import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { formatCode } from "../src/codegen/formatter.js";
import { validateFlow } from "../src/schema/validate.js";
import type { Flow } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): Flow {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
}

describe("emitExpress", () => {
  it("generates clean, idiomatic Express code for the hello-world flow", async () => {
    const flow = loadFixture("hello-world.flow.json");
    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);

    expect(formatted).toMatchSnapshot();
    expect(formatted).toContain('const express = require("express");');
    expect(formatted).toContain("const app = express();");
    expect(formatted).toContain("app.use(express.json());");
    expect(formatted).toContain('app.get("/hello"');
    expect(formatted).toContain('res.status(200).json({ message: "Hello World" });');
    expect(formatted).toContain("app.listen(3000");
  });

  it("declares module-level variables before route/listen code (Phase 10)", async () => {
    const flow = loadFixture("hello-world.flow.json");
    flow.variables = [
      { id: "var1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" },
      { id: "var2", name: "greeting", keyword: "const", dataType: "string", defaultValue: "hi" },
    ];

    const { code } = emitExpress(flow);
    const formatted = await formatCode(code);

    expect(formatted).toContain("let counter = 0;");
    expect(formatted).toContain('const greeting = "hi";');

    const counterIdx = formatted.indexOf("let counter = 0;");
    const greetingIdx = formatted.indexOf('const greeting = "hi";');
    const routeIdx = formatted.indexOf("app.get(");
    const listenIdx = formatted.indexOf("app.listen(");
    expect(counterIdx).toBeGreaterThan(-1);
    expect(greetingIdx).toBeGreaterThan(-1);
    expect(routeIdx).toBeGreaterThan(counterIdx);
    expect(routeIdx).toBeGreaterThan(greetingIdx);
    expect(listenIdx).toBeGreaterThan(routeIdx);
  });

  it("orders listen after routes even though both connect directly from init", async () => {
    const flow = loadFixture("hello-world.flow.json");
    const { code } = emitExpress(flow);

    const routeIdx = code.indexOf("app.get(");
    const listenIdx = code.indexOf("app.listen(");
    expect(routeIdx).toBeGreaterThan(-1);
    expect(listenIdx).toBeGreaterThan(routeIdx);
  });

  it("rejects a flow with no express.init node", () => {
    const flow = loadFixture("hello-world.flow.json");
    flow.nodes = flow.nodes.filter((n) => n.type !== "express.init");
    flow.edges = flow.edges.filter((e) => e.source !== "init_1");

    expect(() => emitExpress(flow)).toThrow(/express.init/);
  });

  it("rejects a route with no handler attached", () => {
    const flow = loadFixture("hello-world.flow.json");
    flow.edges = flow.edges.filter((e) => e.id !== "e3");

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no handler attached"))).toBe(true);
  });

  it("rejects a flow with two express.init nodes", () => {
    const flow = loadFixture("hello-world.flow.json");
    flow.nodes.push({ id: "init_2", type: "express.init", position: { x: 0, y: 300 }, data: {} });

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Only one"))).toBe(true);
  });

  it("detects a cycle in the graph", () => {
    const flow = loadFixture("hello-world.flow.json");
    flow.edges.push({ id: "e_cycle", source: "send_json_1", target: "route_1" });

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cycle"))).toBe(true);
  });

  // Regression: the canvas let you drag a node's own output pin back into one of its own
  // input pins with no error — a self-loop is a cycle regardless of which two pins on the
  // node it connects, and should be rejected the same as any other cycle.
  it("detects a self-loop (a node's own output wired back into its own input)", () => {
    const flow = loadFixture("hello-world.flow.json");
    flow.edges.push({ id: "e_selfloop", source: "send_json_1", target: "send_json_1" });

    const result = validateFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cycle"))).toBe(true);
  });
});
