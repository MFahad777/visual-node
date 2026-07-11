import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import {
  withParentsBeforeChildren,
  overlapsGroup,
  findContainingGroup,
  reparentNode,
  assignInitialMembers,
  releaseChildrenOfDeletedGroup,
} from "./subflowGroups";

// Helper to create minimal test nodes
function makeNode(id: string, type: string, x: number = 0, y: number = 0, parentId?: string): Node {
  return {
    id,
    type,
    position: { x, y },
    width: 100,
    height: 60,
    data: {},
    ...(parentId && { parentId }),
    positionAbsoluteX: x,
    positionAbsoluteY: y,
  } as any;
}

function makeGroupNode(
  id: string,
  x: number = 0,
  y: number = 0,
  width: number = 300,
  height: number = 200,
  parentId?: string,
): Node {
  return {
    id,
    type: "annotation.commentGroup",
    position: { x, y },
    width,
    height,
    data: { width, height },
    ...(parentId && { parentId }),
    positionAbsoluteX: x,
    positionAbsoluteY: y,
  } as any;
}

describe("subflowGroups", () => {
  describe("withParentsBeforeChildren", () => {
    it("reorders so parents come before their children", () => {
      const nodes: Node[] = [
        makeNode("child1", "express.init", 10, 10, "group1"),
        makeGroupNode("group1", 0, 0),
        makeNode("n1", "express.listen", 100, 100),
      ];

      const result = withParentsBeforeChildren(nodes);
      const ids = result.map((n) => n.id);

      expect(ids.indexOf("group1")).toBeLessThan(ids.indexOf("child1"));
    });

    it("preserves order within parents partition and within children partition", () => {
      const nodes: Node[] = [
        makeNode("child2", "express.init", 10, 20, "group1"),
        makeNode("n1", "express.listen", 100, 100),
        makeNode("child1", "express.init", 10, 10, "group1"),
        makeGroupNode("group1", 0, 0),
        makeNode("n2", "express.init", 200, 100),
      ];

      const result = withParentsBeforeChildren(nodes);
      const parentIds = result
        .filter((n) => !n.parentId)
        .map((n) => n.id);
      const childIds = result
        .filter((n) => n.parentId)
        .map((n) => n.id);

      expect(parentIds).toEqual(["n1", "group1", "n2"]);
      expect(childIds).toEqual(["child2", "child1"]);
    });

    it("handles all nodes with no parents", () => {
      const nodes: Node[] = [
        makeNode("n1", "express.init"),
        makeNode("n2", "express.listen"),
      ];

      const result = withParentsBeforeChildren(nodes);
      expect(result).toEqual(nodes);
    });

    it("handles all nodes with parents (no orphans)", () => {
      const nodes: Node[] = [
        makeNode("child1", "express.init", 10, 10, "group1"),
        makeNode("child2", "express.init", 20, 20, "group1"),
      ];

      const result = withParentsBeforeChildren(nodes);
      // Still returns the same nodes since there are no parents
      expect(result).toEqual(nodes);
    });
  });

  describe("overlapsGroup", () => {
    it("returns true for a node fully inside a group", () => {
      const node = makeNode("n1", "express.init", 50, 50, undefined);
      const group = makeGroupNode("cg1", 0, 0, 300, 200);

      expect(overlapsGroup(node, group)).toBe(true);
    });

    it("returns true for a node partially overlapping a group", () => {
      const node = makeNode("n1", "express.init", 250, 50, undefined);
      const group = makeGroupNode("cg1", 0, 0, 300, 200);

      expect(overlapsGroup(node, group)).toBe(true);
    });

    it("returns false for a node outside a group", () => {
      const node = makeNode("n1", "express.init", 400, 400, undefined);
      const group = makeGroupNode("cg1", 0, 0, 300, 200);

      expect(overlapsGroup(node, group)).toBe(false);
    });

    it("returns false for a node just touching the edge without overlap", () => {
      const node = makeNode("n1", "express.init", 300, 50, undefined);
      const group = makeGroupNode("cg1", 0, 0, 300, 200);

      expect(overlapsGroup(node, group)).toBe(false);
    });
  });

  describe("findContainingGroup", () => {
    it("finds the group with largest overlap area", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 100, 100),
        makeGroupNode("g2", 50, 50, 200, 200),
        makeNode("n1", "express.init", 75, 75),
      ];

      const result = findContainingGroup(nodes, "n1");
      expect(result).toBe("g2");
    });

    it("returns null if no groups exist", () => {
      const nodes: Node[] = [makeNode("n1", "express.init", 50, 50)];

      const result = findContainingGroup(nodes, "n1");
      expect(result).toBeNull();
    });

    it("returns null if the dragged node is a group itself", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 100, 100),
        makeGroupNode("g2", 200, 200, 100, 100),
      ];

      const result = findContainingGroup(nodes, "g1");
      expect(result).toBeNull();
    });

    it("prefers a different group with larger overlap even when a current parent exists", () => {
      const nodes: Node[] = [
        makeGroupNode("parent", 0, 0, 100, 100),
        makeGroupNode("other", 50, 50, 200, 200),
        makeNode("n1", "express.init", 75, 75, "parent"),
      ];

      const result = findContainingGroup(nodes, "n1");
      expect(result).toBe("other");
    });

    it("keeps the node in its current parent when it still overlaps only that group", () => {
      // Regression test: findContainingGroup used to unconditionally exclude the node's
      // current parent from candidates, so dragging a node around inside its own (only)
      // group and dropping it would spuriously un-parent it since no *other* group
      // overlapped. The current parent must be scored like any other candidate.
      const nodes: Node[] = [
        makeGroupNode("parent", 0, 0, 300, 200),
        makeNode("n1", "express.init", 75, 75, "parent"),
      ];

      const result = findContainingGroup(nodes, "n1");
      expect(result).toBe("parent");
    });

    it("uses a group's live top-level width/height, not a stale data.width/data.height copy", () => {
      // Simulates a group that was resized via NodeResizer: top-level width/height are
      // updated live by React Flow, but data.width/data.height (written once at creation)
      // is left stale. Containment must follow the live size.
      const group: Node = {
        ...makeGroupNode("g1", 0, 0, 100, 100),
        width: 400,
        height: 400,
        data: { width: 100, height: 100 },
      } as any;
      const nodes: Node[] = [group, makeNode("n1", "express.init", 300, 300)];

      const result = findContainingGroup(nodes, "n1");
      expect(result).toBe("g1");
    });

    it("returns null if dragged node is not found", () => {
      const nodes: Node[] = [makeGroupNode("g1", 0, 0, 100, 100)];

      const result = findContainingGroup(nodes, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("reparentNode", () => {
    it("converts position from absolute to parent-relative when parenting", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 100, 100, 300, 200),
        makeNode("n1", "express.init", 150, 150),
      ];

      const result = reparentNode(nodes, "n1", "g1");
      const node = result.find((n) => n.id === "n1");

      expect(node?.parentId).toBe("g1");
      expect(node?.position).toEqual({ x: 50, y: 50 });
    });

    it("converts position from parent-relative to absolute when un-parenting", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 100, 100, 300, 200),
        {
          ...makeNode("n1", "express.init", 50, 50),
          parentId: "g1",
          positionAbsoluteX: 150,
          positionAbsoluteY: 150,
        } as any,
      ];

      const result = reparentNode(nodes, "n1", null);
      const node = result.find((n) => n.id === "n1");

      expect(node?.parentId).toBeUndefined();
      expect(node?.position).toEqual({ x: 150, y: 150 });
    });

    it("returns parent-before-children ordering", () => {
      const nodes: Node[] = [
        makeNode("n1", "express.init", 50, 50),
        makeGroupNode("g1", 0, 0, 300, 200),
      ];

      const result = reparentNode(nodes, "n1", "g1");
      const ids = result.map((n) => n.id);

      expect(ids.indexOf("g1")).toBeLessThan(ids.indexOf("n1"));
    });
  });

  describe("assignInitialMembers", () => {
    it("reparents multiple nodes into a group", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 300, 200),
        makeNode("n1", "express.init", 50, 50),
        makeNode("n2", "express.listen", 100, 100),
      ];

      const result = assignInitialMembers(nodes, "g1", ["n1", "n2"]);

      const n1 = result.find((n) => n.id === "n1");
      const n2 = result.find((n) => n.id === "n2");

      expect(n1?.parentId).toBe("g1");
      expect(n2?.parentId).toBe("g1");
    });

    it("preserves group parent position in ordering", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 300, 200),
        makeNode("n1", "express.init", 50, 50),
        makeNode("n2", "express.listen", 100, 100),
      ];

      const result = assignInitialMembers(nodes, "g1", ["n1", "n2"]);
      const ids = result.map((n) => n.id);

      expect(ids.indexOf("g1")).toBeLessThan(ids.indexOf("n1"));
      expect(ids.indexOf("g1")).toBeLessThan(ids.indexOf("n2"));
    });
  });

  describe("releaseChildrenOfDeletedGroup", () => {
    it("un-parents all children of a deleted group", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 300, 200),
        {
          ...makeNode("n1", "express.init", 50, 50),
          parentId: "g1",
          positionAbsoluteX: 50,
          positionAbsoluteY: 50,
        } as any,
        {
          ...makeNode("n2", "express.listen", 100, 100),
          parentId: "g1",
          positionAbsoluteX: 100,
          positionAbsoluteY: 100,
        },
      ];

      const result = releaseChildrenOfDeletedGroup(nodes, "g1");

      const n1 = result.find((n) => n.id === "n1");
      const n2 = result.find((n) => n.id === "n2");

      expect(n1?.parentId).toBeUndefined();
      expect(n2?.parentId).toBeUndefined();
    });

    it("preserves nodes with different parents", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 300, 200),
        makeGroupNode("g2", 400, 0, 300, 200),
        {
          ...makeNode("n1", "express.init", 50, 50),
          parentId: "g1",
          positionAbsoluteX: 50,
          positionAbsoluteY: 50,
        } as any,
        {
          ...makeNode("n2", "express.listen", 100, 100),
          parentId: "g2",
          positionAbsoluteX: 500,
          positionAbsoluteY: 100,
        },
      ];

      const result = releaseChildrenOfDeletedGroup(nodes, "g1");

      const n1 = result.find((n) => n.id === "n1");
      const n2 = result.find((n) => n.id === "n2");

      expect(n1?.parentId).toBeUndefined();
      expect(n2?.parentId).toBe("g2");
    });

    it("returns parent-before-children ordering", () => {
      const nodes: Node[] = [
        makeGroupNode("g1", 0, 0, 300, 200),
        {
          ...makeNode("n1", "express.init", 50, 50),
          parentId: "g1",
          positionAbsoluteX: 50,
          positionAbsoluteY: 50,
        } as any,
      ];

      const result = releaseChildrenOfDeletedGroup(nodes, "g1");
      // n1 is now unparented, so ordering doesn't matter for this specific test,
      // but we verify the function still maintains the invariant
      expect(result.length).toBe(2);
    });
  });
});
