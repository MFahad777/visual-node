import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as flatbuffers from "flatbuffers";
import { decodeFlow, encodeFlow } from "../src/serialization/flatbuffer-flow.js";
import type { Flow } from "../src/schema/node.types.js";
import { Flow as FbsFlow } from "../src/schema/generated/flow-server/fbs/flow.js";
import { FlowNode as FbsFlowNode } from "../src/schema/generated/flow-server/fbs/flow-node.js";
import { Meta as FbsMeta } from "../src/schema/generated/flow-server/fbs/meta.js";
import { Position as FbsPosition } from "../src/schema/generated/flow-server/fbs/position.js";

/**
 * Builds FlatBuffers bytes the way pre-Phase-10 `encodeFlow` did: never calls
 * `FbsFlow.addVariables()` at all, so the `variables` field is genuinely ABSENT (not just an
 * empty vector) — the real shape of an already-on-disk `.blueprint` file from before this field
 * existed. Used to prove `decodeFlow` tolerates true absence, not just an empty-but-present
 * vector (which `encodeFlow` always writes now).
 */
function encodeLegacyFlowWithoutVariablesField(): Uint8Array {
  const builder = new flatbuffers.Builder(256);
  const versionOffset = builder.createString("1");
  const metaOffset = FbsMeta.createMeta(builder, builder.createString("pre-phase-10"), builder.createString("express"));

  const idOffset = builder.createString("n1");
  const typeOffset = builder.createString("express.init");
  FbsPosition.startPosition(builder);
  FbsPosition.addX(builder, 0);
  FbsPosition.addY(builder, 0);
  const positionOffset = FbsPosition.endPosition(builder);
  const dataOffset = FbsFlowNode.createDataVector(builder, new Uint8Array());
  FbsFlowNode.startFlowNode(builder);
  FbsFlowNode.addId(builder, idOffset);
  FbsFlowNode.addType(builder, typeOffset);
  FbsFlowNode.addPosition(builder, positionOffset);
  FbsFlowNode.addData(builder, dataOffset);
  const nodeOffset = FbsFlowNode.endFlowNode(builder);

  const nodesVectorOffset = FbsFlow.createNodesVector(builder, [nodeOffset]);
  const edgesVectorOffset = FbsFlow.createEdgesVector(builder, []);

  FbsFlow.startFlow(builder);
  FbsFlow.addVersion(builder, versionOffset);
  FbsFlow.addMeta(builder, metaOffset);
  FbsFlow.addNodes(builder, nodesVectorOffset);
  FbsFlow.addEdges(builder, edgesVectorOffset);
  // Deliberately never calls FbsFlow.addVariables() here.
  const flowOffset = FbsFlow.endFlow(builder);

  builder.finish(flowOffset, "FSFL");
  return builder.asUint8Array();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

function loadFixture(name: string): Flow {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
}

const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

describe("flatbuffer-flow round-trip", () => {
  it("finds at least one fixture to test against", () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  for (const fixtureFile of fixtureFiles) {
    it(`round-trips ${fixtureFile} through encodeFlow/decodeFlow`, () => {
      const original = loadFixture(fixtureFile);
      const encoded = encodeFlow(original);
      expect(encoded).toBeInstanceOf(Uint8Array);

      const decoded = decodeFlow(encoded);
      expect(decoded).toEqual(original);
    });
  }

  it("round-trips a node whose data has an undefined-valued property instead of throwing (e.g. array.includes' optional fromIndex default)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "undefined-field-test", target: "express" },
      nodes: [
        { id: "n1", type: "array.includes", position: { x: 0, y: 0 }, data: { fromIndex: undefined, searchElement: 5 } },
      ],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded.nodes[0].data).toEqual({ searchElement: 5 });
  });

  it("round-trips a node with an empty data object", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "empty-data-test", target: "express" },
      nodes: [{ id: "n1", type: "express.init", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips a node whose data has a nested object and a raw JS-source string (like handler.customCode)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "custom-code-test", target: "express" },
      nodes: [
        {
          id: "n1",
          type: "express.init",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "custom_1",
          type: "handler.customCode",
          position: { x: 100, y: 50 },
          data: {
            code: "res.status(200).json({ ok: true, nested: { deep: [1, 2, 3] } });\n// a comment with \"quotes\" and 'apostrophes'",
            options: {
              statusCode: 200,
              headers: { "Content-Type": "application/json" },
              flags: [true, false, null],
            },
            retries: 3,
          },
        },
      ],
      edges: [{ id: "e1", source: "n1", target: "custom_1" }],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips edges with and without sourceHandle/targetHandle", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "edge-handle-test", target: "fastify" },
      nodes: [
        { id: "a", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "b", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      ],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips a flow with no nodes and no edges", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "empty-flow", target: "express" },
      nodes: [],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips a flow's variables (Phase 10)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "variables-test", target: "express" },
      nodes: [],
      edges: [],
      variables: [
        { id: "var1", name: "counter", keyword: "let", dataType: "number", defaultValue: "0" },
        { id: "var2", name: "greeting", keyword: "const", dataType: "string" },
      ],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("decodes a pre-Phase-10 flow with the variables field genuinely absent to variables: [] (backward compat)", () => {
    const decoded = decodeFlow(encodeLegacyFlowWithoutVariablesField());
    expect(decoded.variables).toEqual([]);
    expect(decoded.nodes).toEqual([{ id: "n1", type: "express.init", position: { x: 0, y: 0 }, data: {} }]);
  });

  it("throws on JSON bytes instead of silently returning an empty-shaped Flow (pre-migration .blueprint files)", () => {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(loadFixture(fixtureFiles[0])));
    expect(() => decodeFlow(jsonBytes)).toThrow(/not a valid FlowServer FlatBuffers file/);
  });

  it("throws on empty/too-short input instead of crashing or silently succeeding", () => {
    expect(() => decodeFlow(new Uint8Array(0))).toThrow(/too short/);
    expect(() => decodeFlow(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
  });
});
