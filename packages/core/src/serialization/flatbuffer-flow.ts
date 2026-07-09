// Encodes/decodes a `Flow` (packages/core/src/schema/node.types.ts) to/from the hybrid
// FlatBuffers/FlexBuffers on-disk format described in
// docs/phase8-backend-grpc-flatbuffers-plan.md: the envelope (version/meta/nodes/edges
// shape) is a strict FlatBuffers schema (packages/core/src/schema/flow.fbs, compiled to
// packages/core/src/schema/generated/), while each node's dynamic `data: Record<string,
// any>` is embedded as an opaque FlexBuffer byte blob inside the `FlowNode.data: [ubyte]`
// vector field.
//
// `flatbuffers` (the npm package) bundles both the FlatBuffers Builder/ByteBuffer *and* a
// FlexBuffers builder/reader, but its package.json has no "exports" map and its top-level
// entry point ("flatbuffers.js") only re-exports the FlatBuffers half — FlexBuffers lives
// at the subpath below and has to be imported directly.
// This module is intentionally free of Node builtins (no `node:fs`, etc.) — it's imported
// at runtime by packages/editor-ui via the `@visual-node/core/flatbuffer-flow` subpath
// export (see package.json), which exists specifically so the browser bundle never pulls
// in Node-only code. Do not add a `node:fs`/`node:fs/promises` import here; file I/O
// helpers that need those live in `./flatbuffer-flow-io.ts` instead, which is server-only
// and reachable only through `@visual-node/core`'s main barrel, never the browser subpath.
import * as flatbuffers from "flatbuffers";
import * as flexbuffers from "flatbuffers/js/flexbuffers.js";

import type { Flow, FlowEdge, FlowNode, VariableDeclaration } from "../schema/node.types.js";
import { Flow as FbsFlow } from "../schema/generated/visual-node/fbs/flow.js";
import { FlowNode as FbsFlowNode } from "../schema/generated/visual-node/fbs/flow-node.js";
import { FlowEdge as FbsFlowEdge } from "../schema/generated/visual-node/fbs/flow-edge.js";
import { Meta as FbsMeta } from "../schema/generated/visual-node/fbs/meta.js";
import { Position as FbsPosition } from "../schema/generated/visual-node/fbs/position.js";
import { Variable as FbsVariable } from "../schema/generated/visual-node/fbs/variable.js";

const FILE_IDENTIFIER = "FSFL";

/** Builds a FlatBuffers `Position` table. Must complete before the owning FlowNode's own
 * `startObject`/`endObject` pair begins — FlatBuffers requires children fully built
 * before their parent references them. */
function buildPosition(builder: flatbuffers.Builder, x: number, y: number): flatbuffers.Offset {
  FbsPosition.startPosition(builder);
  FbsPosition.addX(builder, x);
  FbsPosition.addY(builder, y);
  return FbsPosition.endPosition(builder);
}

/** FlexBuffers has no representation for `undefined` and `flexbuffers.encode()` throws on
 * one — recursively drops any object property/array element whose value is `undefined`.
 * A real crash caught only by testing: a config field declared with `default: undefined`
 * (e.g. array-search.factory.ts's "fromIndex", meaning "optional, not set") gets baked
 * verbatim into a fresh node's `data` by `addNodeFromPalette`'s `Object.fromEntries`, so
 * placing that node on the canvas made every subsequent encode (Save, live validation)
 * throw before the request ever left the browser. */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) result[key] = stripUndefined(v);
    }
    return result;
  }
  return value;
}

function buildNode(builder: flatbuffers.Builder, node: FlowNode): flatbuffers.Offset {
  // Child offsets (strings, the FlexBuffer data vector, the nested Position table) must
  // all be created before FlowNode.startFlowNode() opens the parent table.
  const dataBytes = flexbuffers.encode(stripUndefined(node.data ?? {}));
  const dataOffset = FbsFlowNode.createDataVector(builder, dataBytes);
  // `id`/`type` default to "" rather than being required, matching `data`/`position`'s
  // existing leniency above: callers are allowed to persist a structurally-incomplete Flow
  // (e.g. a node the user hasn't finished configuring yet) and get real validation errors
  // later at compile/generate time instead of an encode-time crash on save.
  const idOffset = builder.createString(node.id ?? "");
  const typeOffset = builder.createString(node.type ?? "");
  const positionOffset = buildPosition(builder, node.position?.x ?? 0, node.position?.y ?? 0);

  FbsFlowNode.startFlowNode(builder);
  FbsFlowNode.addId(builder, idOffset);
  FbsFlowNode.addType(builder, typeOffset);
  FbsFlowNode.addPosition(builder, positionOffset);
  FbsFlowNode.addData(builder, dataOffset);
  return FbsFlowNode.endFlowNode(builder);
}

function buildEdge(builder: flatbuffers.Builder, edge: FlowEdge): flatbuffers.Offset {
  // Same leniency as buildNode() above: `isPlausibleFlow` (editor-server/src/flow-shape.ts)
  // only checks that `nodes`/`edges` are arrays and `meta` is an object — it never validates
  // individual edge fields, so a structurally-incomplete edge can legitimately reach here.
  const idOffset = builder.createString(edge.id ?? "");
  const sourceOffset = builder.createString(edge.source ?? "");
  const sourceHandleOffset = edge.sourceHandle !== undefined ? builder.createString(edge.sourceHandle) : 0;
  const targetOffset = builder.createString(edge.target ?? "");
  const targetHandleOffset = edge.targetHandle !== undefined ? builder.createString(edge.targetHandle) : 0;

  return FbsFlowEdge.createFlowEdge(
    builder,
    idOffset,
    sourceOffset,
    sourceHandleOffset,
    targetOffset,
    targetHandleOffset,
  );
}

function buildVariable(builder: flatbuffers.Builder, variable: VariableDeclaration): flatbuffers.Offset {
  // Same all-string-fields shape as buildEdge() above — no dynamic `data` bag, so no FlexBuffer
  // blob is needed here.
  const idOffset = builder.createString(variable.id ?? "");
  const nameOffset = builder.createString(variable.name ?? "");
  const keywordOffset = builder.createString(variable.keyword ?? "let");
  const dataTypeOffset = builder.createString(variable.dataType ?? "string");
  const defaultValueOffset = variable.defaultValue !== undefined ? builder.createString(variable.defaultValue) : 0;

  return FbsVariable.createVariable(builder, idOffset, nameOffset, keywordOffset, dataTypeOffset, defaultValueOffset);
}

/** Encodes a `Flow` into the FlatBuffers/FlexBuffers hybrid binary format. */
export function encodeFlow(flow: Flow): Uint8Array {
  const builder = new flatbuffers.Builder(1024);

  // Bottom-up assembly: every child (strings, the Meta table, each FlowNode/FlowEdge
  // table, the nodes/edges vectors) must be fully built before the Flow table itself is
  // started. `version`/`meta.name`/`meta.target` default to "" for the same reason as
  // buildNode()/buildEdge() above — `isPlausibleFlow` only requires `meta` to be an object,
  // not that its fields are populated.
  const versionOffset = builder.createString(flow.version ?? "");

  const metaNameOffset = builder.createString(flow.meta?.name ?? "");
  const metaTargetOffset = builder.createString(flow.meta?.target ?? "");
  const metaOffset = FbsMeta.createMeta(builder, metaNameOffset, metaTargetOffset);

  const nodeOffsets = flow.nodes.map((node) => buildNode(builder, node));
  const nodesVectorOffset = FbsFlow.createNodesVector(builder, nodeOffsets);

  const edgeOffsets = flow.edges.map((edge) => buildEdge(builder, edge));
  const edgesVectorOffset = FbsFlow.createEdgesVector(builder, edgeOffsets);

  const variableOffsets = (flow.variables ?? []).map((variable) => buildVariable(builder, variable));
  const variablesVectorOffset = FbsFlow.createVariablesVector(builder, variableOffsets);

  FbsFlow.startFlow(builder);
  FbsFlow.addVersion(builder, versionOffset);
  FbsFlow.addMeta(builder, metaOffset);
  FbsFlow.addNodes(builder, nodesVectorOffset);
  FbsFlow.addEdges(builder, edgesVectorOffset);
  FbsFlow.addVariables(builder, variablesVectorOffset);
  const flowOffset = FbsFlow.endFlow(builder);

  builder.finish(flowOffset, FILE_IDENTIFIER);
  return builder.asUint8Array();
}

/** Decodes the FlatBuffers/FlexBuffers hybrid binary format back into a plain `Flow`
 * object. This eagerly reconstructs the whole tree rather than preserving FlatBuffers'
 * zero-copy lazy-access accessors — correctness and simplicity matter more than avoiding
 * an allocation for flow files this small. */
export function decodeFlow(bytes: Uint8Array): Flow {
  // FlatBuffers' getRootAsFlow() never validates its input — fed garbage bytes (e.g. a
  // pre-Phase-8 JSON `.blueprint` file that hasn't been migrated yet), it silently reads
  // whatever it finds at the offsets it expects and returns some Flow-shaped nonsense, most
  // often looking like an empty flow rather than throwing. That's a real data-loss trap
  // once callers write the result back to disk. Checking the file identifier up front turns
  // that into a clear, immediate error instead.
  if (bytes.length < 8) {
    throw new Error(`not a valid VisualNode FlatBuffers file: only ${bytes.length} bytes (too short)`);
  }
  const bb = new flatbuffers.ByteBuffer(bytes);
  if (!bb.__has_identifier(FILE_IDENTIFIER)) {
    throw new Error(
      `not a valid VisualNode FlatBuffers file: missing or mismatched file identifier ` +
        `(expected "${FILE_IDENTIFIER}") — this file may still be in the old JSON format ` +
        `and need migration (see scripts/migrate-blueprints.mjs)`,
    );
  }
  const fbsFlow = FbsFlow.getRootAsFlow(bb);

  const nodes: FlowNode[] = [];
  for (let i = 0; i < fbsFlow.nodesLength(); i++) {
    const fbsNode = fbsFlow.nodes(i);
    if (!fbsNode) continue;

    const dataBytes = fbsNode.dataArray();
    // dataArray() is a view onto the whole file's underlying ArrayBuffer; flexbuffers'
    // toReference() reads length/metadata off the *end* of the buffer it's given, so it
    // needs a buffer trimmed to exactly the FlexBuffer's own bytes, not a view into a
    // larger one. `.slice()` copies into a fresh, exactly-sized ArrayBuffer.
    const data =
      dataBytes && dataBytes.length > 0
        ? (flexbuffers.toObject(dataBytes.slice().buffer) as Record<string, unknown>)
        : {};

    const fbsPosition = fbsNode.position();

    nodes.push({
      id: fbsNode.id(),
      type: fbsNode.type(),
      position: { x: fbsPosition ? fbsPosition.x() : 0, y: fbsPosition ? fbsPosition.y() : 0 },
      data,
    });
  }

  const edges: FlowEdge[] = [];
  for (let i = 0; i < fbsFlow.edgesLength(); i++) {
    const fbsEdge = fbsFlow.edges(i);
    if (!fbsEdge) continue;

    const sourceHandle = fbsEdge.sourceHandle();
    const targetHandle = fbsEdge.targetHandle();

    const edge: FlowEdge = {
      id: fbsEdge.id(),
      source: fbsEdge.source(),
      target: fbsEdge.target(),
    };
    if (sourceHandle !== null) edge.sourceHandle = sourceHandle;
    if (targetHandle !== null) edge.targetHandle = targetHandle;
    edges.push(edge);
  }

  // Defaults to [] when absent (a pre-Phase-10 .blueprint file has never written this vector at
  // all) — `variablesLength()` returns 0 in that case, same "offset is 0 -> empty" convention
  // FlatBuffers already uses for `nodes`/`edges` above, so no pre-existing file breaks.
  const variables: VariableDeclaration[] = [];
  for (let i = 0; i < fbsFlow.variablesLength(); i++) {
    const fbsVariable = fbsFlow.variables(i);
    if (!fbsVariable) continue;

    const defaultValue = fbsVariable.defaultValue();
    const dataType = fbsVariable.dataType();
    const variable: VariableDeclaration = {
      id: fbsVariable.id(),
      name: fbsVariable.name(),
      keyword: fbsVariable.keyword() as VariableDeclaration["keyword"],
      // Defensive fallback even though the schema marks this field required — a Phase-10
      // file written before `dataType` existed would otherwise decode to an empty string.
      dataType: (dataType || "string") as VariableDeclaration["dataType"],
    };
    if (defaultValue !== null) variable.defaultValue = defaultValue;
    variables.push(variable);
  }

  const fbsMeta = fbsFlow.meta();

  return {
    version: fbsFlow.version(),
    meta: {
      name: fbsMeta ? fbsMeta.name() : "",
      target: (fbsMeta ? fbsMeta.target() : "express") as Flow["meta"]["target"],
    },
    nodes,
    edges,
    variables,
  };
}
