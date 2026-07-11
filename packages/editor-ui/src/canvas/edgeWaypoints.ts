// Phase 31 — Redirecting Wire (Anchor/Reroute Points)

import type { Edge, Node, NodeChange, XYPosition } from "@xyflow/react";

export interface XYPoint {
  x: number;
  y: number;
}

/**
 * Given the full ordered point sequence a wire currently routes through
 * (`[sourceEndpoint, ...existingWaypoints, targetEndpoint]`, length >= 2), returns the
 * index at which `newPoint` should be inserted among the *waypoints* (i.e. an index into
 * the waypoints array alone, 0..waypoints.length inclusive) that adds the least extra
 * path length — the standard nearest-insertion heuristic for ordering a point along a
 * polyline.
 */
export function bestInsertIndex(points: XYPoint[], newPoint: XYPoint): number {
  // points.length is always >= 2 (source + target at minimum). There are
  // points.length - 1 segments; candidate insertion index i (0-based, into the
  // *waypoints* array) corresponds to inserting between points[i] and points[i+1].
  function dist(a: XYPoint, b: XYPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  let bestIndex = 0;
  let bestCost = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const prev = points[i];
    const next = points[i + 1];
    const cost = dist(prev, newPoint) + dist(newPoint, next) - dist(prev, next);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Phase 32: When nodes move (single drag or multi-group drag), translate any waypoints
 * on edges whose endpoints moved by the same delta. Waypoints are stored as absolute
 * flow coordinates, so they need manual translation to follow their connected nodes.
 *
 * Phase 34: When a parent comment group is dragged, React Flow does NOT emit position
 * NodeChanges for its children (since they are parent-relative and don't actually change
 * in the data model — they visually move because their parent moved). However, waypoints
 * anchored to child nodes still need to be translated by the parent's delta. This fix
 * computes descendants of any moved node via the parentId chain and applies the same
 * position delta to their waypoints.
 *
 * Returns an array of edge data updates to apply via `onEdgesChange`, or empty if no
 * waypoints were affected.
 */
export function translateWaypoints(
  nodes: Node[],
  edges: Edge[],
  nodeChanges: NodeChange[]
): Array<{ id: string; data: Record<string, unknown> }> {
  // Fast path: this runs on every single pointermove frame of any drag. Reroute waypoints
  // (Phase 31) are opt-in and most edges never have any — bail before building the
  // parentId->children descendant map or scanning every edge below when there's nothing
  // for this function to do.
  const hasAnyWaypoints = edges.some((edge) => {
    const waypoints = (edge.data as { waypoints?: unknown[] } | undefined)?.waypoints;
    return waypoints && waypoints.length > 0;
  });
  if (!hasAnyWaypoints) return [];

  // Build a parentId -> children map for fast descendant lookup
  const childrenByParentId = new Map<string, Node[]>();
  for (const node of nodes) {
    if (node.parentId) {
      if (!childrenByParentId.has(node.parentId)) {
        childrenByParentId.set(node.parentId, []);
      }
      childrenByParentId.get(node.parentId)!.push(node);
    }
  }

  // Recursively collect all descendants of a node
  function getDescendants(nodeId: string): string[] {
    const descendants: string[] = [];
    const directChildren = childrenByParentId.get(nodeId) ?? [];
    for (const child of directChildren) {
      descendants.push(child.id);
      descendants.push(...getDescendants(child.id));
    }
    return descendants;
  }

  // Extract which nodes changed position and by how much
  const positionDeltas = new Map<string, XYPosition>();

  for (const change of nodeChanges) {
    if (change.type === "position" && "position" in change && change.position) {
      const nodeId = change.id;

      const currentNode = nodes.find((n) => n.id === nodeId);
      if (!currentNode) continue;

      const delta = {
        x: change.position.x - currentNode.position.x,
        y: change.position.y - currentNode.position.y,
      };
      positionDeltas.set(nodeId, delta);

      // Also apply the same delta to all descendants via the parentId chain.
      // When a parent is dragged, its children don't emit position changes (they're
      // parent-relative), but their waypoints do need to move in absolute coordinates.
      for (const descendantId of getDescendants(nodeId)) {
        positionDeltas.set(descendantId, delta);
      }
    }
  }

  if (positionDeltas.size === 0) return [];

  // Update waypoints on any edge whose endpoints moved
  const edgeUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const edge of edges) {
    const sourceDelta = positionDeltas.get(edge.source);
    const targetDelta = positionDeltas.get(edge.target);

    if (!sourceDelta && !targetDelta) continue;

    const waypoints = (edge.data as { waypoints?: Array<{ x: number; y: number }> } | undefined)
      ?.waypoints;
    if (!waypoints || waypoints.length === 0) continue;

    // In a group drag (multi-select), both endpoints move by the same amount, so either
    // delta works. If only one moved, use that one's delta.
    const delta = sourceDelta || targetDelta;
    if (!delta) continue;

    const updatedWaypoints = waypoints.map((wp) => ({
      x: wp.x + delta.x,
      y: wp.y + delta.y,
    }));

    edgeUpdates.push({
      id: edge.id,
      data: {
        ...edge.data,
        waypoints: updatedWaypoints,
      },
    });
  }

  return edgeUpdates;
}
