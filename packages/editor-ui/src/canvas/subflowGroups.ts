import type { Node } from "@xyflow/react";

/** Reorders a node list so parents appear before children, preserving original order within
 * each partition. Required by React Flow's hard invariant that a parent must precede its
 * children in the `nodes` array. Depth-1 only (comment groups cannot nest). */
export function withParentsBeforeChildren(nodes: Node[]): Node[] {
  const parents: Node[] = [];
  const children: Node[] = [];

  for (const node of nodes) {
    if (node.parentId) {
      children.push(node);
    } else {
      parents.push(node);
    }
  }

  return [...parents, ...children];
}

/** AABB overlap check: returns true if two axis-aligned bounding boxes overlap at all. */
function aabbOverlap(
  nodeX: number,
  nodeY: number,
  nodeW: number,
  nodeH: number,
  groupX: number,
  groupY: number,
  groupW: number,
  groupH: number,
): boolean {
  return (
    nodeX < groupX + groupW &&
    nodeX + nodeW > groupX &&
    nodeY < groupY + groupH &&
    nodeY + nodeH > groupY
  );
}

/** Computes the area of intersection between two axis-aligned bounding boxes. */
function overlapArea(
  nodeX: number,
  nodeY: number,
  nodeW: number,
  nodeH: number,
  groupX: number,
  groupY: number,
  groupW: number,
  groupH: number,
): number {
  const left = Math.max(nodeX, groupX);
  const right = Math.min(nodeX + nodeW, groupX + groupW);
  const top = Math.max(nodeY, groupY);
  const bottom = Math.min(nodeY + nodeH, groupY + groupH);

  if (left >= right || top >= bottom) return 0;
  return (right - left) * (bottom - top);
}

/** Checks if a node (by absolute position) overlaps a comment-group node's bounds. */
export function overlapsGroup(nodeAbsBounds: Node, groupNode: Node): boolean {
  const nodeX = (nodeAbsBounds as any).positionAbsoluteX ?? nodeAbsBounds.position.x ?? 0;
  const nodeY = (nodeAbsBounds as any).positionAbsoluteY ?? nodeAbsBounds.position.y ?? 0;
  const nodeW = nodeAbsBounds.width ?? 0;
  const nodeH = nodeAbsBounds.height ?? 0;

  const groupX = (groupNode as any).positionAbsoluteX ?? groupNode.position.x ?? 0;
  const groupY = (groupNode as any).positionAbsoluteY ?? groupNode.position.y ?? 0;
  // Prefer the live top-level width/height (kept current by React Flow's "dimensions"
  // NodeChange on every NodeResizer resize) over the data.width/data.height copy, which is
  // only ever written once at creation/load time and goes stale after a resize.
  const groupW = groupNode.width ?? (groupNode.data?.width as number) ?? 0;
  const groupH = groupNode.height ?? (groupNode.data?.height as number) ?? 0;

  return aabbOverlap(nodeX, nodeY, nodeW, nodeH, groupX, groupY, groupW, groupH);
}

/** Finds which comment-group node the dragged node now overlaps (best match = largest area).
 * Returns the group's id, or null if it overlaps no group at all. The node's current
 * parent (if any) is scored like any other candidate — it is not treated specially — so a
 * node that stays inside its own group keeps its current parent instead of being spuriously
 * un-parented; it only moves to a different group when that group's overlap area is larger,
 * and only un-parents when no group's overlap area is positive. */
export function findContainingGroup(nodes: Node[], draggedNodeId: string): string | null {
  const draggedNode = nodes.find((n) => n.id === draggedNodeId);
  if (!draggedNode || draggedNode.type === "annotation.commentGroup") {
    return null;
  }

  // Calculate the dragged node's absolute position (convert from parent-relative if needed)
  let nodeAbsX = draggedNode.position.x;
  let nodeAbsY = draggedNode.position.y;
  if (draggedNode.parentId) {
    const currentParent = nodes.find((n) => n.id === draggedNode.parentId);
    if (currentParent) {
      nodeAbsX += currentParent.position.x;
      nodeAbsY += currentParent.position.y;
    }
  }
  // Use a default size if the node doesn't have explicit dimensions (e.g., hasn't been
  // measured by React Flow yet, or is a node type with minimal rendering). The defaults
  // match typical node dimensions — should be large enough to detect meaningful overlaps
  // with comment groups without being so large as to create false positives.
  const nodeW = draggedNode.width ?? 100;
  const nodeH = draggedNode.height ?? 60;

  let bestGroupId: string | null = null;
  let bestArea = 0;

  for (const candidate of nodes) {
    if (candidate.type !== "annotation.commentGroup") continue;

    // Group's position is always absolute (comment groups can't be nested)
    const groupX = candidate.position.x;
    const groupY = candidate.position.y;
    // Prefer the live top-level width/height over the data.width/data.height copy — see
    // overlapsGroup's comment above for why the data copy goes stale after a resize.
    const groupW = candidate.width ?? (candidate.data?.width as number) ?? 0;
    const groupH = candidate.height ?? (candidate.data?.height as number) ?? 0;

    const area = overlapArea(nodeAbsX, nodeAbsY, nodeW, nodeH, groupX, groupY, groupW, groupH);
    if (area > bestArea) {
      bestArea = area;
      bestGroupId = candidate.id;
    }
  }

  return bestGroupId;
}

/** Converts a node's position from absolute to relative-to-parent (or vice versa).
 * Used when reparenting: when setting parentId, position becomes parent-relative.
 * When clearing parentId, position becomes absolute. */
function convertPositionSpace(
  nodes: Node[],
  nodeId: string,
  newParentId: string | null,
): Node[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) return node;

    const oldParentId = node.parentId;
    const newNode = { ...node };
    if (newParentId) {
      newNode.parentId = newParentId;
    } else {
      delete newNode.parentId;
    }

    // Get current position (could be absolute or parent-relative)
    let absX = node.position.x;
    let absY = node.position.y;

    // If currently parented, convert to absolute first
    if (oldParentId) {
      const oldParent = nodes.find((n) => n.id === oldParentId);
      if (oldParent) {
        const parentAbsX = oldParent.position.x;
        const parentAbsY = oldParent.position.y;
        absX += parentAbsX;
        absY += parentAbsY;
      }
    } else {
      // Already absolute
      absX = (node as any).positionAbsoluteX ?? node.position.x;
      absY = (node as any).positionAbsoluteY ?? node.position.y;
    }

    // If new parent exists, convert absolute to parent-relative
    if (newParentId) {
      const newParent = nodes.find((n) => n.id === newParentId);
      if (newParent) {
        // Use parent's position field directly (not positionAbsoluteX/Y, which aren't
        // available on freshly created nodes before React Flow's layout pass).
        const parentAbsX = newParent.position.x;
        const parentAbsY = newParent.position.y;
        newNode.position = {
          x: absX - parentAbsX,
          y: absY - parentAbsY,
        };
      } else {
        newNode.position = { x: absX, y: absY };
      }
    } else {
      // No new parent, position is absolute
      newNode.position = { x: absX, y: absY };
    }

    return newNode;
  });
}

/** Sets or clears a node's parentId and converts its position between absolute and
 * parent-relative coordinate space as needed. Returns a new nodes array with proper
 * parent-before-children ordering. */
export function reparentNode(nodes: Node[], nodeId: string, newParentId: string | null): Node[] {
  const updated = convertPositionSpace(nodes, nodeId, newParentId);
  return withParentsBeforeChildren(updated);
}

/** Reparents multiple nodes into a comment-group in one step (used after group creation).
 * Returns a new nodes array with proper ordering. */
export function assignInitialMembers(nodes: Node[], groupId: string, memberIds: string[]): Node[] {
  let result = nodes;
  for (const memberId of memberIds) {
    result = reparentNode(result, memberId, groupId);
  }
  return result;
}

/** Releases all direct children of a deleted group back to absolute positioning.
 * Returns a new nodes array. Call this before filtering the deleted group out. */
export function releaseChildrenOfDeletedGroup(nodes: Node[], deletedGroupId: string): Node[] {
  let result = nodes;
  for (const node of nodes) {
    if (node.parentId === deletedGroupId) {
      result = reparentNode(result, node.id, null);
    }
  }
  return result;
}
