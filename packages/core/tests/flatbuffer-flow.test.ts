import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as flatbuffers from "flatbuffers";
import { decodeFlow, encodeFlow } from "../src/serialization/flatbuffer-flow.js";
import { registerBuiltinNodes } from "../src/nodes/index.js";
import type { Flow } from "../src/schema/node.types.js";
import { Flow as FbsFlow } from "../src/schema/generated/visual-node/fbs/flow.js";
import { FlowNode as FbsFlowNode } from "../src/schema/generated/visual-node/fbs/flow-node.js";
import { Meta as FbsMeta } from "../src/schema/generated/visual-node/fbs/meta.js";
import { Position as FbsPosition } from "../src/schema/generated/visual-node/fbs/position.js";
import { FlowEdge as FbsFlowEdge } from "../src/schema/generated/visual-node/fbs/flow-edge.js";

registerBuiltinNodes();

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

  it("round-trips a node whose data has a nested object and a raw JS-source string (like logic.handlerFunction's code mode)", () => {
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
          type: "logic.handlerFunction",
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

  it("round-trips an edge's waypoints (Phase 31 — reroute anchors)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "waypoints-test", target: "express" },
      nodes: [
        { id: "a", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        { id: "b", type: "express.init", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          waypoints: [
            { id: "wp1", x: 60, y: 90 },
            { id: "wp2", x: 140, y: -30 },
          ],
        },
      ],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("decodes a pre-Phase-31 edge with the waypoints field genuinely absent to no waypoints property (backward compat)", () => {
    const builder = new flatbuffers.Builder(256);
    const versionOffset = builder.createString("1");
    const metaOffset = FbsMeta.createMeta(builder, builder.createString("pre-phase-31"), builder.createString("express"));

    const idOffset = builder.createString("e1");
    const sourceOffset = builder.createString("a");
    const targetOffset = builder.createString("b");
    FbsFlowEdge.startFlowEdge(builder);
    FbsFlowEdge.addId(builder, idOffset);
    FbsFlowEdge.addSource(builder, sourceOffset);
    FbsFlowEdge.addTarget(builder, targetOffset);
    // Deliberately never calls FbsFlowEdge.addWaypoints() here.
    const edgeOffset = FbsFlowEdge.endFlowEdge(builder);

    const nodesVectorOffset = FbsFlow.createNodesVector(builder, []);
    const edgesVectorOffset = FbsFlow.createEdgesVector(builder, [edgeOffset]);
    const variablesVectorOffset = FbsFlow.createVariablesVector(builder, []);

    FbsFlow.startFlow(builder);
    FbsFlow.addVersion(builder, versionOffset);
    FbsFlow.addMeta(builder, metaOffset);
    FbsFlow.addNodes(builder, nodesVectorOffset);
    FbsFlow.addEdges(builder, edgesVectorOffset);
    FbsFlow.addVariables(builder, variablesVectorOffset);
    const flowOffset = FbsFlow.endFlow(builder);
    builder.finish(flowOffset, "FSFL");

    const decoded = decodeFlow(builder.asUint8Array());
    expect(decoded.edges).toEqual([{ id: "e1", source: "a", target: "b" }]);
    expect(decoded.edges[0]).not.toHaveProperty("waypoints");
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
    expect(() => decodeFlow(jsonBytes)).toThrow(/not a valid VisualNode FlatBuffers file/);
  });

  it("throws on empty/too-short input instead of crashing or silently succeeding", () => {
    expect(() => decodeFlow(new Uint8Array(0))).toThrow(/too short/);
    expect(() => decodeFlow(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
  });

  it("round-trips a flow's comments with multiple entries (Phase 33)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "comments-test", target: "express" },
      nodes: [],
      edges: [],
      variables: [],
      comments: [
        {
          id: "cg1",
          title: "Setup Section",
          position: { x: 10, y: 20 },
          width: 300,
          height: 200,
          color: "#7d5ba6",
        },
        {
          id: "cg2",
          title: "Handler Logic",
          position: { x: 400, y: 50 },
          width: 250,
          height: 350,
          color: "#4a90e2",
        },
      ],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips a flow with an empty comments array (Phase 33) — empty array is not persisted, consistent with waypoints", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "empty-comments-test", target: "express" },
      nodes: [],
      edges: [],
      variables: [],
      comments: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    // Empty comments array is not persisted in the output — matching waypoints behavior
    expect(decoded).toEqual({
      version: "1",
      meta: { name: "empty-comments-test", target: "express" },
      nodes: [],
      edges: [],
      variables: [],
    });
  });

  it("decodes a pre-Phase-33 flow with the comments field genuinely absent — comments property absent (like waypoints)", () => {
    const builder = new flatbuffers.Builder(256);
    const versionOffset = builder.createString("1");
    const metaOffset = FbsMeta.createMeta(builder, builder.createString("pre-phase-33"), builder.createString("express"));

    const nodesVectorOffset = FbsFlow.createNodesVector(builder, []);
    const edgesVectorOffset = FbsFlow.createEdgesVector(builder, []);
    const variablesVectorOffset = FbsFlow.createVariablesVector(builder, []);

    FbsFlow.startFlow(builder);
    FbsFlow.addVersion(builder, versionOffset);
    FbsFlow.addMeta(builder, metaOffset);
    FbsFlow.addNodes(builder, nodesVectorOffset);
    FbsFlow.addEdges(builder, edgesVectorOffset);
    FbsFlow.addVariables(builder, variablesVectorOffset);
    // Deliberately never calls FbsFlow.addComments() here.
    const flowOffset = FbsFlow.endFlow(builder);
    builder.finish(flowOffset, "FSFL");

    const decoded = decodeFlow(builder.asUint8Array());
    expect(decoded).not.toHaveProperty("comments");
    expect(decoded.version).toBe("1");
    expect(decoded.meta.name).toBe("pre-phase-33");
  });

  it("round-trips a node whose data has a non-float32-exact decimal alongside string fields without throwing (BigInt/Number indirect() regression)", () => {
    // FlexBuffers picks a WIDTH64 internal representation whenever a value/object contains an
    // ordinary JS decimal that isn't exactly representable in 32-bit float precision (almost any
    // real decimal — 9.99, 0.1, 123.456789, etc.) alongside string keys. A prior version of the
    // vendored `flatbuffers` package's FlexBuffers reader mixed BigInt and Number in its
    // indirect() function's arithmetic under WIDTH64, throwing a TypeError at decode time. This
    // is NOT a "huge flow" bug — it reproduces with a single small node.
    const flow: Flow = {
      version: "1",
      meta: { name: "big-decode-test", target: "express" },
      nodes: [
        {
          id: "n1",
          type: "variable.set",
          position: { x: 0, y: 0 },
          data: { variableId: "v1", literals: { value: "test" }, someDecimal: 9.99, another: 123.456789 },
        },
      ],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded.nodes[0].data.someDecimal).toBe(9.99);
    expect(decoded).toEqual(flow);
  });

  it("decodes a large integer literal (>= 2^31, needs FlexBuffers 64-bit width) back as a JS number, not a bigint", () => {
    // operators.greaterThan/add/etc. (effectivePorts.ts's NUMBER_LITERAL_TYPES) store unwired
    // literal values as real JS numbers in data.literals. FlexBuffers picks the narrowest
    // integer width that fits each value; anything with magnitude >= 2^31 needs 64-bit width,
    // and the flatbuffers package's flexbuffers reader hands back a native `bigint` for that
    // width, not a `number` — reproduced directly here without needing the huge real-world flow
    // that originally surfaced it (a `purchaseAmount` threshold on operators.greaterThan).
    const flow: Flow = {
      version: "1",
      meta: { name: "bigint-literal-test", target: "express" },
      nodes: [
        {
          id: "n1",
          type: "operators.greaterThan",
          position: { x: 0, y: 0 },
          data: { literals: { b: 5_000_000_000 } },
        },
      ],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    const literalValue = (decoded.nodes[0].data as { literals: { b: unknown } }).literals.b;
    expect(typeof literalValue).toBe("number");
    expect(literalValue).toBe(5_000_000_000);
    expect(decoded).toEqual(flow);
  });

  // NOTE: node.data values below deliberately avoid pairing a value that's exactly
  // representable in float32 (e.g. 12.5, 0.25, -30.5) alongside another decimal in the same
  // flat JS object. Doing so was found, while writing this test, to trip a SEPARATE,
  // still-present FlexBuffers reader bug distinct from the BigInt/Number crash this patch
  // fixes: when one sibling value needs full float64 precision (forcing the whole object's
  // internal vector to WIDTH64) and another sibling is float32-exact, the float32-exact
  // value silently decodes to a garbage magnitude (e.g. 12.5 -> ~5.4e-315) instead of either
  // throwing or round-tripping correctly. That bug is out of scope for this task (the patch
  // under test only fixes the indirect() BigInt/Number arithmetic crash) and untouched here;
  // every decimal below (0.0725, 12.99, 0.15, etc.) needs true float64 precision, so no
  // sibling in the same object is float32-exact and this test exercises only the fixed bug.
  it("round-trips a large, realistic flow with nested function graphs, decimal variable defaults, comments, and edge waypoints (BigInt/Number indirect() regression, real-world shape)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "large-realistic-flow", target: "express" },
      nodes: [
        { id: "init", type: "express.init", position: { x: 0, y: 0 }, data: {} },
        {
          id: "fn1",
          type: "logic.function",
          position: { x: 200, y: 0 },
          data: {
            name: "computeTotal",
            params: ["price", "quantity"],
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: "mult",
                  type: "operators.multiply",
                  position: { x: 150, y: 0 },
                  data: { taxRate: 0.0725, discount: 12.99 },
                },
                { id: "ret", type: "logic.graphReturn", position: { x: 300, y: 0 }, data: {} },
              ],
              edges: [
                { id: "ge1", source: "entry", sourceHandle: "price", target: "mult", targetHandle: "a" },
                { id: "ge2", source: "entry", sourceHandle: "quantity", target: "mult", targetHandle: "b" },
                { id: "ge3", source: "mult", target: "ret", targetHandle: "in" },
              ],
              variables: [
                { id: "fnvar1", name: "taxMultiplier", keyword: "const", dataType: "number", defaultValue: "1.0725" },
              ],
            },
          },
        },
        {
          id: "fn2",
          type: "logic.function",
          position: { x: 200, y: 200 },
          data: {
            name: "applyDiscount",
            params: ["amount"],
            mode: "blueprint",
            graph: {
              nodes: [
                { id: "entry2", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: {} },
                {
                  id: "sub",
                  type: "operators.subtract",
                  position: { x: 150, y: 0 },
                  data: { rate: 0.15 },
                },
                { id: "ret2", type: "logic.graphReturn", position: { x: 300, y: 0 }, data: {} },
              ],
              edges: [
                { id: "ge4", source: "entry2", sourceHandle: "amount", target: "sub", targetHandle: "a" },
                { id: "ge5", source: "sub", target: "ret2", targetHandle: "in" },
              ],
              variables: [
                { id: "fnvar2", name: "discountFactor", keyword: "let", dataType: "number", defaultValue: "0.855" },
              ],
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "init", target: "fn1" },
        {
          id: "e2",
          source: "fn1",
          target: "fn2",
          waypoints: [
            { id: "wp1", x: 60, y: 90 },
            { id: "wp2", x: 140, y: -30.5 },
          ],
        },
      ],
      variables: [
        { id: "modvar1", name: "globalRate", keyword: "const", dataType: "number", defaultValue: "3.14159" },
      ],
      comments: [
        {
          id: "cg1",
          title: "Pricing Functions",
          position: { x: 10, y: 20 },
          width: 300.5,
          height: 200,
          color: "#7d5ba6",
        },
      ],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips a node with parentId set (Phase 34 — comment groups as subflows)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "parentid-test", target: "express" },
      nodes: [
        { id: "cg1", type: "annotation.commentGroup", position: { x: 0, y: 0 }, data: { title: "Group 1" } },
        { id: "n1", type: "express.init", position: { x: 10, y: 10 }, data: {}, parentId: "cg1" },
        { id: "n2", type: "express.listen", position: { x: 10, y: 60 }, data: {}, parentId: "cg1" },
      ],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
  });

  it("round-trips a node with no parentId set and does not include parentId property (Phase 34 backward compat)", () => {
    const flow: Flow = {
      version: "1",
      meta: { name: "no-parentid-test", target: "express" },
      nodes: [
        { id: "n1", type: "express.init", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      variables: [],
    };

    const decoded = decodeFlow(encodeFlow(flow));
    expect(decoded).toEqual(flow);
    expect(decoded.nodes[0]).not.toHaveProperty("parentId");
  });

  it("decodes a pre-Phase-34 node with the parentId field genuinely absent — parentId property absent (backward compat)", () => {
    const builder = new flatbuffers.Builder(256);
    const versionOffset = builder.createString("1");
    const metaOffset = FbsMeta.createMeta(builder, builder.createString("pre-phase-34"), builder.createString("express"));

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
    // Deliberately never calls FbsFlowNode.addParentId() here.
    const nodeOffset = FbsFlowNode.endFlowNode(builder);

    const nodesVectorOffset = FbsFlow.createNodesVector(builder, [nodeOffset]);
    const edgesVectorOffset = FbsFlow.createEdgesVector(builder, []);

    FbsFlow.startFlow(builder);
    FbsFlow.addVersion(builder, versionOffset);
    FbsFlow.addMeta(builder, metaOffset);
    FbsFlow.addNodes(builder, nodesVectorOffset);
    FbsFlow.addEdges(builder, edgesVectorOffset);
    const flowOffset = FbsFlow.endFlow(builder);

    builder.finish(flowOffset, "FSFL");

    const decoded = decodeFlow(builder.asUint8Array());
    expect(decoded.nodes).toEqual([{ id: "n1", type: "express.init", position: { x: 0, y: 0 }, data: {} }]);
    expect(decoded.nodes[0]).not.toHaveProperty("parentId");
  });
});
