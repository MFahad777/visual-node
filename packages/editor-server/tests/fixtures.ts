import type { Flow } from "@visual-node/core";

/**
 * Vitest runs test files in parallel, and tests that spawn a real `node server.js`
 * process bind a real port — give each test file its own port via `port` so files
 * running concurrently (e.g. generate.routes.test.ts and run.routes.test.ts) never
 * collide with EADDRINUSE.
 */
export function makeHelloWorldFlow(port: number): Flow {
  return {
    version: "1",
    meta: { name: "hello-world-api", target: "express" },
    nodes: [
      { id: "init_1", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      { id: "json_parser_1", type: "express.middleware.jsonParser", position: { x: 200, y: 0 }, data: {} },
      { id: "route_1", type: "express.route", position: { x: 400, y: 0 }, data: { method: "GET", path: "/hello" } },
      {
        id: "handler_1",
        type: "logic.handlerFunction",
        position: { x: 600, y: 0 },
        data: { name: "handler", mode: "code", body: 'res.status(200).json({ message: "Hello World" });' },
      },
      { id: "listen_1", type: "express.listen", position: { x: 200, y: 200 }, data: { port } },
    ],
    edges: [
      { id: "e1", source: "init_1", target: "json_parser_1" },
      { id: "e2", source: "json_parser_1", target: "route_1" },
      { id: "e3", source: "route_1", target: "handler_1" },
      { id: "e4", source: "init_1", target: "listen_1" },
    ],
    variables: [],
  };
}

export const helloWorldFlow: Flow = makeHelloWorldFlow(3000);

export const routeWithNoHandlerFlow: Flow = {
  version: "1",
  meta: { name: "broken", target: "express" },
  nodes: [
    { id: "init_1", type: "express.init", position: { x: 0, y: 0 }, data: {} },
    { id: "route_1", type: "express.route", position: { x: 200, y: 0 }, data: { method: "GET", path: "/hello" } },
  ],
  edges: [],
  variables: [],
};
