import { describe, expect, it } from "vitest";
import { emitExpress } from "../src/codegen/emit-express.js";
import { emitExecChain } from "../src/codegen/exec-chain.js";
import { getNodeDefinition, registerNode, requireNodeDefinition, type EmitContext, type NodeDefinition } from "../src/schema/node-registry.js";
import type { Flow, FlowEdge, FlowNode } from "../src/schema/node.types.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

/**
 * A minimal handler-category node whose emit() declares `requiresAsync: true` — stands in for
 * a future async-capable plugin node (Phase 9 Part A/B). Registered once, guarded the same way
 * other test files here guard their test-only node registrations.
 */
const asyncRequiringNode: NodeDefinition = {
  type: "test.asyncRequiring",
  category: "handler",
  label: "Test Async Requiring",
  description: "Test-only node that declares requiresAsync: true.",
  inputs: [{ id: "in", label: "In" }],
  outputs: [],
  configSchema: [],
  requiresAsync: true,
  emit: () => ({ body: "await Promise.resolve();", order: 0 }),
};
if (!getNodeDefinition(asyncRequiringNode.type)) registerNode(asyncRequiringNode);

function makeFlow(nodes: FlowNode[], edges: FlowEdge[]): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

function initNode(): FlowNode {
  return { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} };
}

function listenNode(): FlowNode {
  return { id: "listen", type: "express.listen", position: { x: 0, y: 0 }, data: { port: 3000 } };
}

describe("Route node — isAsync", () => {
  function flowWithRoute(routeData: Record<string, unknown>, handler: FlowNode): Flow {
    return makeFlow(
      [initNode(), { id: "route", type: "express.route", position: { x: 0, y: 0 }, data: routeData }, handler, listenNode()],
      [
        { id: "e1", source: "init", target: "route" },
        { id: "e2", source: "route", target: handler.id },
        { id: "e3", source: "init", target: "listen" },
      ],
    );
  }

  it("defaults to a non-async handler (isAsync absent) — identical output to before this feature", () => {
    const handler: FlowNode = { id: "h1", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ ok: true });" } };
    const flow = flowWithRoute({ method: "GET", path: "/x" }, handler);
    const { code } = emitExpress(flow);
    expect(code).toContain('app.get("/x", (req, res) => {');
    expect(code).not.toContain("async (req, res)");
  });

  it("isAsync: false explicitly also emits no async prefix", () => {
    const handler: FlowNode = { id: "h1", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ ok: true });" } };
    const flow = flowWithRoute({ method: "GET", path: "/x", isAsync: false }, handler);
    const { code } = emitExpress(flow);
    expect(code).toContain('app.get("/x", (req, res) => {');
    expect(code).not.toContain("async (req, res)");
  });

  it("isAsync: true emits an async handler", () => {
    const handler: FlowNode = { id: "h1", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ ok: true });" } };
    const flow = flowWithRoute({ method: "GET", path: "/x", isAsync: true }, handler);
    const { code } = emitExpress(flow);
    expect(code).toContain('app.get("/x", async (req, res) => {');
  });

  it("throws a descriptive error when a downstream node requires async but isAsync is false", () => {
    const handler: FlowNode = { id: "h1", type: "test.asyncRequiring", position: { x: 0, y: 0 }, data: {} };
    const flow = flowWithRoute({ method: "GET", path: "/x", isAsync: false }, handler);
    expect(() => emitExpress(flow)).toThrow(/requires "await".*Async Handler/);
  });

  it("does not throw when isAsync: true matches a downstream node that requires async", () => {
    const handler: FlowNode = { id: "h1", type: "test.asyncRequiring", position: { x: 0, y: 0 }, data: {} };
    const flow = flowWithRoute({ method: "GET", path: "/x", isAsync: true }, handler);
    const { code } = emitExpress(flow);
    expect(code).toContain('app.get("/x", async (req, res) => {');
    expect(code).toContain("await Promise.resolve();");
  });
});

describe("Function node — isAsync", () => {
  function flowWithFunction(fnData: Record<string, unknown>): Flow {
    return makeFlow([{ id: "fn1", type: "logic.function", position: { x: 0, y: 0 }, data: fnData }], []);
  }

  it("defaults to a non-async function (isAsync absent) — identical output to before this feature", () => {
    const flow = flowWithFunction({ name: "myFn", params: "", body: "return 1;" });
    const { code } = emitExpress(flow);
    expect(code).toContain("function myFn() {");
    expect(code).not.toContain("async function");
  });

  it("isAsync: true emits an async function (code mode)", () => {
    const flow = flowWithFunction({ name: "myFn", params: "", body: "return 1;", isAsync: true });
    const { code } = emitExpress(flow);
    expect(code).toContain("async function myFn() {");
  });

  it("isAsync: true emits an async function (blueprint mode)", () => {
    const graph = {
      nodes: [{ id: "entry1", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    const flow = flowWithFunction({ name: "myFn", params: "", mode: "blueprint", graph, isAsync: true });
    const { code } = emitExpress(flow);
    expect(code).toContain("async function myFn() {");
  });
});

describe("Custom Middleware node — isAsync", () => {
  function flowWithMiddleware(data: Record<string, unknown>): Flow {
    return makeFlow(
      [initNode(), { id: "mw", type: "middleware.customCode", position: { x: 0, y: 0 }, data }, listenNode()],
      [
        { id: "e1", source: "init", target: "mw" },
        { id: "e2", source: "mw", target: "listen" },
      ],
    );
  }

  it("defaults to a non-async middleware (isAsync absent) — identical output to before this feature", () => {
    const flow = flowWithMiddleware({ code: "next();" });
    const { code } = emitExpress(flow);
    expect(code).toContain("app.use((req, res, next) => {");
    expect(code).not.toContain("async (req, res, next)");
  });

  it("isAsync: true emits an async middleware", () => {
    const flow = flowWithMiddleware({ code: "next();", isAsync: true });
    const { code } = emitExpress(flow);
    expect(code).toContain("app.use(async (req, res, next) => {");
  });
});

describe("exec-chain.ts — requiresAsync bubbling through Branch/Switch forks", () => {
  function buildCtx(nodes: FlowNode[], edges: FlowEdge[]): EmitContext {
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const matchesHandle = (edge: FlowEdge, side: "source" | "target", handle?: string) =>
      handle === undefined || (side === "source" ? edge.sourceHandle : edge.targetHandle) === handle;
    return {
      flow: { version: "1", meta: { name: "t", target: "express" }, nodes, edges },
      getNode: (id) => nodesById.get(id),
      getIncoming: (id, handle) => edges.filter((e) => e.target === id && matchesHandle(e, "target", handle)),
      getOutgoing: (id, handle) => edges.filter((e) => e.source === id && matchesHandle(e, "source", handle)),
      emitNode: (id) => {
        const node = nodesById.get(id);
        if (!node) throw new Error(`unknown node ${id}`);
        return requireNodeDefinition(node.type).emit(node, buildCtx(nodes, edges));
      },
    };
  }

  it("bubbles requiresAsync up from a single arm of a Branch fork", () => {
    const nodes: FlowNode[] = [
      { id: "b1", type: "controlFlow.branch", position: { x: 0, y: 0 }, data: { literals: { condition: "true" } } },
      { id: "asyncArm", type: "test.asyncRequiring", position: { x: 0, y: 0 }, data: {} },
      { id: "plainArm", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ ok: true });" } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "b1", target: "asyncArm", sourceHandle: "true", targetHandle: "in" },
      { id: "e2", source: "b1", target: "plainArm", sourceHandle: "false", targetHandle: "in" },
    ];
    const ctx = buildCtx(nodes, edges);
    const result = emitExecChain("b1", ctx);
    expect(result.requiresAsync).toBe(true);
  });

  it("does not report requiresAsync when neither Branch arm requires it", () => {
    const nodes: FlowNode[] = [
      { id: "b1", type: "controlFlow.branch", position: { x: 0, y: 0 }, data: { literals: { condition: "true" } } },
      { id: "t1", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ t: true });" } },
      { id: "f1", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ f: true });" } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "b1", target: "t1", sourceHandle: "true", targetHandle: "in" },
      { id: "e2", source: "b1", target: "f1", sourceHandle: "false", targetHandle: "in" },
    ];
    const ctx = buildCtx(nodes, edges);
    const result = emitExecChain("b1", ctx);
    expect(result.requiresAsync).toBe(false);
  });

  it("bubbles requiresAsync up from a single case of a Switch fork", () => {
    const nodes: FlowNode[] = [
      {
        id: "s1",
        type: "controlFlow.switch",
        position: { x: 0, y: 0 },
        data: { literals: { selection: "1" }, cases: [{ id: "c1", value: 1 }] },
      },
      { id: "asyncCase", type: "test.asyncRequiring", position: { x: 0, y: 0 }, data: {} },
      { id: "defaultArm", type: "handler.customCode", position: { x: 0, y: 0 }, data: { code: "res.json({ d: true });" } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "s1", target: "asyncCase", sourceHandle: "case-c1", targetHandle: "in" },
      { id: "e2", source: "s1", target: "defaultArm", sourceHandle: "default", targetHandle: "in" },
    ];
    const ctx = buildCtx(nodes, edges);
    const result = emitExecChain("s1", ctx);
    expect(result.requiresAsync).toBe(true);
  });
});
