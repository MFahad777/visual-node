import { describe, it, expect } from "vitest";
import { Flow, FlowNode, FlowEdge } from "../src/schema/node.types.js";
import { validateFlow } from "../src/schema/validate.js";
import { emitExpress } from "../src/codegen/emit-express.js";
import { getNodeDefinition } from "../src/schema/node-registry.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";

registerBuiltinNodes();

const mockId = () => "node-" + Math.random().toString(36).slice(2, 9);

function makeFlow(nodes: FlowNode[], edges: FlowEdge[] = [], variables: any[] = []): Flow {
  return {
    version: "1.0.0",
    meta: { name: "test", target: "express" },
    nodes,
    edges,
    variables,
  };
}

describe("logic.promise node", () => {
  it("should be registered", () => {
    const def = getNodeDefinition("logic.promise");
    expect(def).toBeDefined();
    expect(def?.type).toBe("logic.promise");
    expect(def?.label).toBe("Promise");
  });

  it("should have all expected pins", () => {
    const def = getNodeDefinition("logic.promise")!;
    const inPins = def.inputs.map((p) => p.id);
    const outPins = def.outputs.map((p) => p.id);
    expect(inPins).toContain("in");
    expect(outPins).toContain("out");
    expect(outPins).toContain("then");
    expect(outPins).toContain("catch");
    expect(outPins).toContain("assign");
    expect(outPins).toContain("value");
    expect(outPins).toContain("error");
  });

  describe("awaited mode", () => {
    it("should compile unwired assign as bare await expression", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: true },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 200, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                { id: "e2", source: promiseId, sourceHandle: "out", target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const code = emitExpress(flow).code;
      expect(code).toContain("await new Promise");
      expect(code).toContain("resolve(42)");
    });

    it("should compile awaited with const assign as merged declaration", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const setId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: true },
                },
                {
                  id: setId,
                  type: "variable.set",
                  position: { x: 200, y: 0 },
                  data: { variableId: "var-1" },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: { value: "result" } },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                { id: "e2", source: promiseId, sourceHandle: "assign", target: setId },
                { id: "e3", source: promiseId, sourceHandle: "out", target: setId },
                { id: "e4", source: setId, target: responseId },
              ],
              variables: [{ id: "var-1", name: "result", keyword: "const", dataType: "any" }],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const code = emitExpress(flow).code;
      expect(code).toContain("const result = await new Promise");
    });
  });

  describe("non-awaited mode (with then/catch)", () => {
    it("should compile with then arm only", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const thenConsoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: false },
                },
                {
                  id: thenConsoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: { values: ["value"] },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                { id: "e2", source: promiseId, sourceHandle: "then", target: thenConsoleId },
                { id: "e3", source: thenConsoleId, target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const code = emitExpress(flow).code;
      expect(code).toContain(".then((value)");
      expect(code).toContain("console.log");
      expect(code).not.toContain(".catch");
    });

    it("should compile with catch arm only", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const catchConsoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: false },
                },
                {
                  id: catchConsoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: { values: ["error"] },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                { id: "e2", source: promiseId, sourceHandle: "catch", target: catchConsoleId },
                { id: "e3", source: catchConsoleId, target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const code = emitExpress(flow).code;
      expect(code).toContain(".catch((error)");
      expect(code).toContain("console.log");
      expect(code).not.toContain(".then");
    });

    it("should compile with both then and catch arms", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const thenConsoleId = mockId();
      const catchConsoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: false },
                },
                {
                  id: thenConsoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: { values: ["value"] },
                },
                {
                  id: catchConsoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 100 },
                  data: { values: ["error"] },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 50 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                { id: "e2", source: promiseId, sourceHandle: "then", target: thenConsoleId },
                { id: "e3", source: promiseId, sourceHandle: "catch", target: catchConsoleId },
                { id: "e4", source: thenConsoleId, target: responseId },
                { id: "e5", source: catchConsoleId, target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const code = emitExpress(flow).code;
      expect(code).toContain(".then((value)");
      expect(code).toContain(".catch((error)");
    });

    it("should compile unwired (fire-and-forget)", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: false },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 200, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                { id: "e2", source: promiseId, sourceHandle: "out", target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const code = emitExpress(flow).code;
      expect(code).toContain("new Promise");
      expect(code).not.toContain(".then");
      expect(code).not.toContain(".catch");
    });
  });

  describe("assign pin validation", () => {
    it("should reject assign wired to non-variable.set node", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const consoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: true },
                },
                {
                  id: consoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: {},
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                // assign wired to console.log instead of variable.set
                { id: "e2", source: promiseId, sourceHandle: "assign", target: consoleId },
                { id: "e3", source: promiseId, sourceHandle: "out", target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors.some((e) => e.message.includes("Assign"))).toBe(true);
    });

    it("should reject assign when target is not immediate out successor", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const setId = mockId();
      const otherSetId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: true },
                },
                {
                  id: setId,
                  type: "variable.set",
                  position: { x: 200, y: 0 },
                  data: { variableId: "var-1" },
                },
                {
                  id: otherSetId,
                  type: "variable.set",
                  position: { x: 300, y: 0 },
                  data: { variableId: "var-2" },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 400, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                // assign wired to setId, but out wired to otherSetId (not immediate out successor)
                { id: "e2", source: promiseId, sourceHandle: "assign", target: setId },
                { id: "e3", source: promiseId, sourceHandle: "out", target: otherSetId },
                { id: "e4", source: otherSetId, target: responseId },
              ],
              variables: [
                { id: "var-1", name: "result", keyword: "const", dataType: "any" },
                { id: "var-2", name: "other", keyword: "const", dataType: "any" },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors.some((e) => e.message.includes("Assign") && e.message.includes("immediately"))).toBe(true);
    });
  });

  describe("value/error arm scoping", () => {
    it("should reject value pin read from outside then arm", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const consoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: false },
                },
                {
                  id: consoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: { values: ["value"] },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                // Try to read value from main flow (not inside then)
                { id: "e2", source: promiseId, sourceHandle: "value", target: consoleId },
                { id: "e3", source: consoleId, target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors.some((e) => e.message.includes("Value") && e.message.includes("Then arm"))).toBe(true);
    });

    it("should reject error pin read from outside catch arm", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const consoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: false },
                },
                {
                  id: consoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: { values: ["error"] },
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                // Try to read error from main flow (not inside catch)
                { id: "e2", source: promiseId, sourceHandle: "error", target: consoleId },
                { id: "e3", source: consoleId, target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors.some((e) => e.message.includes("Error") && e.message.includes("Catch arm"))).toBe(true);
    });

    it("should NOT flag a logic.function's function-as-value pin as a Promise value pin (regression)", () => {
      // "value" is a generic pin id reused by logic.function's function-as-value output
      // (Phase 20) — a Callback reading it has nothing to do with any Promise's then/catch
      // arm, and must not be misidentified as one just because the source handle is "value".
      const initId = mockId();
      const listenId = mockId();
      const beginId = mockId();
      const functionId = mockId();
      const callbackId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: listenId, type: "express.listen", position: { x: 100, y: 0 }, data: { port: 3000 } },
        { id: beginId, type: "logic.begin", position: { x: 0, y: 100 }, data: {} },
        {
          id: functionId,
          type: "logic.function",
          position: { x: 100, y: 100 },
          data: { name: "myCallback", mode: "code", body: "console.log(42);", params: [] },
        },
        {
          id: callbackId,
          type: "logic.callback",
          position: { x: 200, y: 100 },
          data: { args: [] },
        },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: listenId },
        { id: "e2", source: beginId, sourceHandle: "out", target: callbackId, targetHandle: "in" },
        { id: "e3", source: functionId, sourceHandle: "value", target: callbackId, targetHandle: "function" },
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors.some((e) => /Promise|Then arm|Catch arm/.test(e.message))).toBe(false);
    });
  });

  describe("awaited stale-pin check", () => {
    it("should reject then edge when awaited is true", () => {
      const initId = mockId();
      const routeId = mockId();
      const handlerId = mockId();
      const listenId = mockId();
      const promiseId = mockId();
      const consoleId = mockId();
      const responseId = mockId();

      const nodes: FlowNode[] = [
        { id: initId, type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: routeId,
          type: "express.route",
          position: { x: 100, y: 0 },
          data: { method: "GET", path: "/test" },
        },
        {
          id: handlerId,
          type: "logic.handlerFunction",
          position: { x: 200, y: 0 },
          data: {
            name: "handler",
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: promiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(42);", awaited: true },
                },
                {
                  id: consoleId,
                  type: "debug.consoleLog",
                  position: { x: 200, y: 0 },
                  data: {},
                },
                {
                  id: responseId,
                  type: "handler.sendJson",
                  position: { x: 300, y: 0 },
                  data: { statusCode: 200, body: {} },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: promiseId },
                // Stale: wiring then when awaited is true
                { id: "e2", source: promiseId, sourceHandle: "then", target: consoleId },
                { id: "e3", source: consoleId, target: responseId },
              ],
            },
          },
        },
        { id: listenId, type: "express.listen", position: { x: 300, y: 0 }, data: { port: 3000 } },
      ];

      const edges: FlowEdge[] = [
        { id: "e1", source: initId, target: routeId },
        { id: "e2", source: routeId, target: handlerId },
        { id: "e3", source: initId, target: listenId },
        
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors.some((e) => e.message.includes("stale") || e.message.includes("then"))).toBe(true);
    });
  });

  describe("node-level comment", () => {
    it("emits the node's comment above the generated statement (bare, non-awaited)", () => {
      const beginId = mockId();
      const promiseId = mockId();

      const nodes: FlowNode[] = [
        { id: beginId, type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: promiseId,
          type: "logic.promise",
          position: { x: 100, y: 0 },
          data: { mode: "code", body: "resolve(1);", comment: "kick off a fire-and-forget promise" },
        },
      ];
      const edges: FlowEdge[] = [
        { id: "e1", source: beginId, sourceHandle: "out", target: promiseId, targetHandle: "in" },
      ];

      const { code } = emitExpress(makeFlow(nodes, edges));
      expect(code).toContain("kick off a fire-and-forget promise");
      const commentIndex = code.indexOf("kick off a fire-and-forget promise");
      const statementIndex = code.indexOf("new Promise");
      expect(commentIndex).toBeGreaterThan(-1);
      expect(statementIndex).toBeGreaterThan(commentIndex);
    });

    it("emits the node's comment above an awaited assign statement", () => {
      const beginId = mockId();
      const promiseId = mockId();
      const setId = mockId();

      const nodes: FlowNode[] = [
        { id: beginId, type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: promiseId,
          type: "logic.promise",
          position: { x: 100, y: 0 },
          data: { mode: "code", body: "resolve(1);", awaited: true, comment: "await and assign result" },
        },
        {
          id: setId,
          type: "variable.set",
          position: { x: 200, y: 0 },
          data: { variableId: "var1" },
        },
      ];
      const edges: FlowEdge[] = [
        { id: "e1", source: beginId, sourceHandle: "out", target: promiseId, targetHandle: "in" },
        { id: "e2", source: promiseId, sourceHandle: "assign", target: setId, targetHandle: "value" },
        { id: "e3", source: promiseId, sourceHandle: "out", target: setId, targetHandle: "in" },
      ];
      const variables = [{ id: "var1", name: "result", keyword: "let", dataType: "number" }];

      const { code } = emitExpress(makeFlow(nodes, edges, variables));
      expect(code).toContain("await and assign result");
      const commentIndex = code.indexOf("await and assign result");
      const statementIndex = code.indexOf("await new Promise");
      expect(commentIndex).toBeGreaterThan(-1);
      expect(statementIndex).toBeGreaterThan(commentIndex);
    });
  });

  describe("nested Promise inside a Blueprint-mode executor", () => {
    it("declares the outer executor async when a nested awaited Promise needs await", () => {
      const beginId = mockId();
      const outerPromiseId = mockId();
      const innerPromiseId = mockId();

      const nodes: FlowNode[] = [
        { id: beginId, type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: outerPromiseId,
          type: "logic.promise",
          position: { x: 100, y: 0 },
          data: {
            mode: "blueprint",
            awaited: true,
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: innerPromiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "resolve(1);", awaited: true },
                },
              ],
              edges: [{ id: "e1", source: "entry", sourceHandle: "out", target: innerPromiseId }],
            },
          },
        },
      ];
      const edges: FlowEdge[] = [
        { id: "e1", source: beginId, sourceHandle: "out", target: outerPromiseId, targetHandle: "in" },
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const { code } = emitExpress(flow);
      // Outer executor is declared async (needed for the inner `await`); the inner
      // Promise's own executor stays synchronous — nothing downstream of it needs await.
      // The outer (blueprint-mode) executor's params are suffixed with its own node id so
      // they can never collide with the inner (code-mode) executor's bare "resolve"/"reject".
      const outerSuffix = outerPromiseId.replace(/[^A-Za-z0-9_$]/g, "_");
      expect(code).toContain(`await new Promise(async (resolve_${outerSuffix}, reject_${outerSuffix}) => {`);
      expect(code).toContain("await new Promise((resolve, reject) => {\n      resolve(1);");
    });

    it("does not let a nested Promise's own executor params shadow the outer graph-entry's resolve/reject", () => {
      // Regression test for a real bug: a Callback node inside a nested (inner) Promise's Then
      // arm, wired to the OUTER blueprint executor's graph-entry "resolve" pin, must reference
      // the OUTER executor's actual resolve parameter — not the inner Promise's own, textually
      // nearer, identically-named "resolve" parameter (before this fix, both executors emitted
      // the bare literal "resolve", so the inner one always won lexically and the outer
      // awaited Promise never settled).
      const beginId = mockId();
      const outerPromiseId = mockId();
      const innerPromiseId = mockId();
      const callbackId = mockId();

      const nodes: FlowNode[] = [
        { id: beginId, type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: outerPromiseId,
          type: "logic.promise",
          position: { x: 100, y: 0 },
          data: {
            mode: "blueprint",
            awaited: true,
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: { params: ["resolve", "reject"] } },
                {
                  id: innerPromiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: { mode: "code", body: "", awaited: false },
                },
                {
                  id: callbackId,
                  type: "logic.callback",
                  position: { x: 200, y: 0 },
                  data: { args: [{ id: "arg1" }] },
                },
              ],
              edges: [
                { id: "e1", source: "entry", sourceHandle: "out", target: innerPromiseId },
                { id: "e2", source: innerPromiseId, sourceHandle: "then", target: callbackId },
                { id: "e3", source: "entry", sourceHandle: "resolve", target: callbackId, targetHandle: "function" },
                { id: "e4", source: "entry", sourceHandle: "resolve", target: callbackId, targetHandle: "arg-arg1" },
              ],
            },
          },
        },
      ];
      const edges: FlowEdge[] = [
        { id: "e1", source: beginId, sourceHandle: "out", target: outerPromiseId, targetHandle: "in" },
      ];

      const flow = makeFlow(nodes, edges);
      const { code } = emitExpress(flow);

      const outerSuffix = outerPromiseId.replace(/[^A-Za-z0-9_$]/g, "_");
      // The outer executor's real parameter name...
      expect(code).toContain(`new Promise((resolve_${outerSuffix}, reject_${outerSuffix}) => {`);
      // ...is exactly what the Callback (inside the inner Promise's Then arm) calls, not the
      // inner Promise's own bare "resolve" (resolveValuePin wraps resolved identifiers in parens).
      expect(code).toContain(`(resolve_${outerSuffix})((resolve_${outerSuffix}))`);
    });

    it("lets a nested Promise's blueprint graph call the OUTER Promise's resolve/reject via the outerResolve/outerReject entry pins", () => {
      // A Callback inside the INNER Promise's own blueprint graph, wired to the inner
      // graph-entry's "outerResolve" pin (not the inner entry's own "resolve"), must resolve
      // straight through to the OUTER Promise's real resolve identifier — this is the feature,
      // not just "no shadowing": the inner graph can deliberately reach out and settle its
      // enclosing Promise.
      const beginId = mockId();
      const outerPromiseId = mockId();
      const innerPromiseId = mockId();
      const callbackId = mockId();

      const nodes: FlowNode[] = [
        { id: beginId, type: "logic.begin", position: { x: 0, y: 0 }, data: {} },
        {
          id: outerPromiseId,
          type: "logic.promise",
          position: { x: 100, y: 0 },
          data: {
            mode: "blueprint",
            awaited: true,
            graph: {
              nodes: [
                { id: "outerEntry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: { params: ["resolve", "reject"] } },
                {
                  id: innerPromiseId,
                  type: "logic.promise",
                  position: { x: 100, y: 0 },
                  data: {
                    mode: "blueprint",
                    awaited: false,
                    graph: {
                      nodes: [
                        {
                          id: "innerEntry",
                          type: "logic.graphEntry",
                          position: { x: 0, y: 0 },
                          data: { params: ["resolve", "reject", "outerResolve", "outerReject"] },
                        },
                        {
                          id: callbackId,
                          type: "logic.callback",
                          position: { x: 100, y: 0 },
                          data: { args: [{ id: "arg1" }] },
                        },
                      ],
                      edges: [
                        { id: "ie1", source: "innerEntry", sourceHandle: "out", target: callbackId, targetHandle: "in" },
                        { id: "ie2", source: "innerEntry", sourceHandle: "outerResolve", target: callbackId, targetHandle: "function" },
                        { id: "ie3", source: "innerEntry", sourceHandle: "outerResolve", target: callbackId, targetHandle: "arg-arg1" },
                      ],
                    },
                  },
                },
              ],
              edges: [{ id: "e1", source: "outerEntry", sourceHandle: "out", target: innerPromiseId }],
            },
          },
        },
      ];
      const edges: FlowEdge[] = [
        { id: "e1", source: beginId, sourceHandle: "out", target: outerPromiseId, targetHandle: "in" },
      ];

      const flow = makeFlow(nodes, edges);
      const result = validateFlow(flow);
      expect(result.errors).toHaveLength(0);

      const { code } = emitExpress(flow);
      const outerSuffix = outerPromiseId.replace(/[^A-Za-z0-9_$]/g, "_");
      // The outer executor's real (unique) params...
      expect(code).toContain(`new Promise((resolve_${outerSuffix}, reject_${outerSuffix}) => {`);
      // ...are exactly what the inner graph's Callback calls via its "outerResolve" pin —
      // not the inner Promise's own executor's resolve/reject (a separate, unique pair).
      expect(code).toContain(`(resolve_${outerSuffix})((resolve_${outerSuffix}))`);
    });
  });
});
