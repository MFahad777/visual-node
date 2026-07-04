import { describe, expect, it } from "vitest";
import { collectFlowDependencies, collectProjectDependencies } from "../src/project/collect-dependencies.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import type { Flow } from "../src/schema/node.types.js";
import type { ProjectFile } from "../src/project/compile-project.js";

registerBuiltinNodes();

function makeFlow(nodes: Flow["nodes"], edges: Flow["edges"] = []): Flow {
  return { version: "1", meta: { name: "test", target: "express" }, nodes, edges };
}

describe("collectFlowDependencies", () => {
  it("collects an npm-mode logic.require node's package and version", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { sourceType: "npm", path: "axios", variableName: "axios", version: "^1.7.0" },
      },
    ]);
    const { dependencies, conflicts } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ axios: "^1.7.0" });
    expect(conflicts).toEqual([]);
  });

  it("ignores local-mode logic.require nodes", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { path: "../helpers/x", variableName: "x" },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({});
  });

  it("parses a comma-separated npmDependencies field on handler.customCode", () => {
    const flow = makeFlow([
      {
        id: "h1",
        type: "handler.customCode",
        position: { x: 0, y: 0 },
        data: { code: "res.json({});", npmDependencies: "axios, lodash@^4.17.0" },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ axios: "*", lodash: "^4.17.0" });
  });

  it("parses npmDependencies on middleware.customCode", () => {
    const flow = makeFlow([
      {
        id: "m1",
        type: "middleware.customCode",
        position: { x: 0, y: 0 },
        data: { code: "next();", npmDependencies: "cors" },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ cors: "*" });
  });

  it("parses npmDependencies on a code-mode logic.function node", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: { name: "helper", params: "", body: "return 1;", npmDependencies: "dayjs@^1.11.0" },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ dayjs: "^1.11.0" });
  });

  it("parses scoped package names, with and without a version", () => {
    const flow = makeFlow([
      {
        id: "h1",
        type: "handler.customCode",
        position: { x: 0, y: 0 },
        data: { code: "res.json({});", npmDependencies: "@org/pkg, @org/other@^1.0.0" },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ "@org/pkg": "*", "@org/other": "^1.0.0" });
  });

  it("records a DependencyConflict when the same package is declared with different versions", () => {
    const flow = makeFlow([
      {
        id: "req1",
        type: "logic.require",
        position: { x: 0, y: 0 },
        data: { sourceType: "npm", path: "axios", variableName: "axios", version: "^1.0.0" },
      },
      {
        id: "h1",
        type: "handler.customCode",
        position: { x: 0, y: 0 },
        data: { code: "res.json({});", npmDependencies: "axios@^2.0.0" },
      },
    ]);
    const { dependencies, conflicts } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ axios: "^1.0.0" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].packageName).toBe("axios");
    expect(conflicts[0].versions).toEqual(["^1.0.0", "^2.0.0"]);
    expect(conflicts[0].resolved).toBe("^1.0.0");
    expect(conflicts[0].sources.map((s) => s.nodeId).sort()).toEqual(["h1", "req1"]);
  });

  it("recurses into a blueprint-mode Function's nested graph", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "helper",
          params: "",
          mode: "blueprint",
          graph: {
            nodes: [
              {
                id: "inner1",
                type: "handler.customCode",
                position: { x: 0, y: 0 },
                data: { code: "", npmDependencies: "uuid@^9.0.0" },
              },
            ],
            edges: [],
          },
        },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({ uuid: "^9.0.0" });
  });

  it("does not double-count a blueprint-mode Function node's own npmDependencies field (only its nested graph is walked)", () => {
    const flow = makeFlow([
      {
        id: "fn1",
        type: "logic.function",
        position: { x: 0, y: 0 },
        data: {
          name: "helper",
          params: "",
          mode: "blueprint",
          npmDependencies: "should-not-appear",
          graph: { nodes: [], edges: [] },
        },
      },
    ]);
    const { dependencies } = collectFlowDependencies(flow);
    expect(dependencies).toEqual({});
  });
});

describe("collectProjectDependencies", () => {
  it("collects across multiple files, tagging each source with its relativePath", () => {
    const files: ProjectFile[] = [
      {
        relativePath: "helpers/a.blueprint",
        flow: makeFlow([
          {
            id: "req1",
            type: "logic.require",
            position: { x: 0, y: 0 },
            data: { sourceType: "npm", path: "axios", variableName: "axios" },
          },
        ]),
      },
      {
        relativePath: "src/server.blueprint",
        flow: makeFlow([
          {
            id: "h1",
            type: "handler.customCode",
            position: { x: 0, y: 0 },
            data: { code: "res.json({});", npmDependencies: "lodash@^4.17.0" },
          },
        ]),
      },
    ];

    const { dependencies, conflicts } = collectProjectDependencies(files);
    expect(dependencies).toEqual({ axios: "*", lodash: "^4.17.0" });
    expect(conflicts).toEqual([]);
  });

  it("attributes conflict sources with the correct relativePath across files", () => {
    const files: ProjectFile[] = [
      {
        relativePath: "helpers/a.blueprint",
        flow: makeFlow([
          {
            id: "req1",
            type: "logic.require",
            position: { x: 0, y: 0 },
            data: { sourceType: "npm", path: "axios", variableName: "axios", version: "^1.0.0" },
          },
        ]),
      },
      {
        relativePath: "src/server.blueprint",
        flow: makeFlow([
          {
            id: "h1",
            type: "handler.customCode",
            position: { x: 0, y: 0 },
            data: { code: "res.json({});", npmDependencies: "axios@^2.0.0" },
          },
        ]),
      },
    ];

    const { conflicts } = collectProjectDependencies(files);
    expect(conflicts).toHaveLength(1);
    const bySource = Object.fromEntries(conflicts[0].sources.map((s) => [s.nodeId, s.relativePath]));
    expect(bySource).toEqual({ req1: "helpers/a.blueprint", h1: "src/server.blueprint" });
  });
});
