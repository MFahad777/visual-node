import type { Node, Edge } from "@xyflow/react";
import type { Flow, VariableDeclaration } from "@flowserver/core";

/** Converts a persisted `Flow` into React Flow's native node/edge shape for the canvas. */
export function flowToGraph(flow: Flow): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: flow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: "flow-edge",
    })),
  };
}

/**
 * Converts React Flow's native node/edge state back into a `Flow` for saving/generating.
 * Drops RF-only runtime fields (selected, dragging, width, height, measured, ...) that
 * never belonged in the serialized flow in the first place. `variables` (Phase 10) isn't a
 * React Flow node/edge — it rides alongside `meta` and is passed through untouched.
 */
export function graphToFlow(nodes: Node[], edges: Edge[], meta: Flow["meta"], variables: VariableDeclaration[]): Flow {
  return {
    version: "1",
    meta,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type!,
      position: n.position,
      data: n.data ?? {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
    variables,
  };
}
