import type { Node, Edge } from "@xyflow/react";
import type { EdgeWaypoint, Flow, VariableDeclaration } from "@visual-node/core";
import { withParentsBeforeChildren } from "../canvas/subflowGroups.js";

/** Converts a persisted `Flow` into React Flow's native node/edge shape for the canvas.
 * Phase 33: Splits comment boxes from `flow.comments` into `nodes[]` with `type: "annotation.commentGroup"`.
 * Phase 34: Preserves parentId for comment-group sub-flows; reorders so parents appear before children.
 */
export function flowToGraph(flow: Flow): { nodes: Node[]; edges: Edge[] } {
  const flowNodes = flow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    ...(n.parentId && { parentId: n.parentId }),
  }));

  const commentNodes = (flow.comments ?? []).map((c) => ({
    id: c.id,
    type: "annotation.commentGroup",
    position: c.position,
    width: c.width,
    height: c.height,
    zIndex: -1,
    data: { title: c.title, color: c.color, width: c.width, height: c.height },
  }));

  const nodes = withParentsBeforeChildren([...flowNodes, ...commentNodes]);

  return {
    nodes,
    edges: flow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: "flow-edge",
      data: e.waypoints ? { waypoints: e.waypoints } : undefined,
    })),
  };
}

/**
 * Converts React Flow's native node/edge state back into a `Flow` for saving/generating.
 * Drops RF-only runtime fields (selected, dragging, width, height, measured, ...) that
 * never belonged in the serialized flow in the first place. `variables` (Phase 10) isn't a
 * React Flow node/edge — it rides alongside `meta` and is passed through untouched.
 * Phase 33: Partitions comment-group nodes back into `flow.comments`.
 */
export function graphToFlow(nodes: Node[], edges: Edge[], meta: Flow["meta"], variables: VariableDeclaration[]): Flow {
  const flowNodes = [];
  const commentGroups = [];

  for (const n of nodes) {
    if (n.type === "annotation.commentGroup") {
      // Map comment-group node back to CommentGroup
      const data = n.data as Record<string, any>;
      commentGroups.push({
        id: n.id,
        title: data.title ?? "Comment",
        position: n.position,
        width: n.width ?? 220,
        height: n.height ?? 120,
        color: data.color ?? "#4b4b63",
      });
    } else {
      // Regular node
      flowNodes.push({
        id: n.id,
        type: n.type!,
        position: n.position,
        data: n.data ?? {},
        ...(n.parentId && { parentId: n.parentId }),
      });
    }
  }

  const flow: Flow = {
    version: "1",
    meta,
    nodes: flowNodes,
    edges: edges.map((e) => {
      const waypoints = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        ...(Array.isArray(waypoints) && waypoints.length > 0 ? { waypoints } : {}),
      };
    }),
    variables,
  };

  // Only include comments if non-empty (back-compat convention)
  if (commentGroups.length > 0) {
    flow.comments = commentGroups;
  }

  return flow;
}
