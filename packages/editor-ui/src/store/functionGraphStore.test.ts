import { describe, it, expect } from "vitest";
import { createFunctionGraphStore } from "./functionGraphStore.js";

describe("functionGraphStore id generation", () => {
  // Regression test: a loaded function graph's node/edge ids may already contain higher
  // numbers than the module-level `nextId` counter (e.g. after a page reload restores a
  // function graph tab whose ids were generated in an earlier session, since `nextId` always
  // restarts at 1 on module load). Without `seedNextId()`, a freshly generated id can collide
  // with an already-loaded one, producing the exact "two children with the same key" React
  // warning this test guards against.
  it("does not generate an edge id colliding with an already-loaded high-numbered edge id", () => {
    const seedGraph = {
      nodes: [
        { id: "fgnode_logic_graphEntry_2", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: { params: [] } },
        { id: "fgnode_debug_consoleLog_3", type: "debug.consoleLog", position: { x: 100, y: 0 }, data: {} },
        { id: "fgnode_debug_consoleLog_5", type: "debug.consoleLog", position: { x: 200, y: 0 }, data: {} },
        { id: "fgnode_debug_consoleLog_6", type: "debug.consoleLog", position: { x: 300, y: 0 }, data: {} },
      ],
      edges: [
        {
          id: "fgedge_4",
          source: "fgnode_logic_graphEntry_2",
          sourceHandle: "out",
          target: "fgnode_debug_consoleLog_3",
          targetHandle: "in",
        },
      ],
    };

    const store = createFunctionGraphStore(seedGraph, []);

    // Generate two genuinely new edges (react-flow's addEdge() no-ops on an exact
    // source/sourceHandle/target/targetHandle duplicate, so these target distinct nodes).
    store.getState().onConnect({
      source: "fgnode_debug_consoleLog_3",
      sourceHandle: "out",
      target: "fgnode_debug_consoleLog_5",
      targetHandle: "in",
    });
    store.getState().onConnect({
      source: "fgnode_debug_consoleLog_3",
      sourceHandle: "out",
      target: "fgnode_debug_consoleLog_6",
      targetHandle: "in",
    });

    const edges = store.getState().edges;
    const ids = edges.map((e) => e.id);

    // No duplicate ids at all (the direct symptom of the original bug).
    expect(new Set(ids).size).toBe(ids.length);

    // Every newly generated edge id must sort past the seeded "fgedge_4".
    const newEdgeIds = ids.filter((id) => id !== "fgedge_4");
    expect(newEdgeIds.length).toBe(2);
    for (const id of newEdgeIds) {
      const match = /^fgedge_(\d+)$/.exec(id);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThan(4);
    }
  });

  it("does not generate a node id colliding with an already-loaded high-numbered node id", () => {
    const seedGraph = {
      nodes: [
        { id: "fgnode_logic_graphEntry_2", type: "logic.graphEntry", position: { x: 0, y: 0 }, data: { params: [] } },
        { id: "fgnode_debug_consoleLog_10", type: "debug.consoleLog", position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [],
    };

    const store = createFunctionGraphStore(seedGraph, []);
    store.getState().addNode("debug.consoleLog", { x: 200, y: 0 }, {});

    const nodeIds = store.getState().nodes.map((n) => n.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);

    const addedId = nodeIds.find((id) => id !== "fgnode_logic_graphEntry_2" && id !== "fgnode_debug_consoleLog_10");
    expect(addedId).toBeDefined();
    const match = /_(\d+)$/.exec(addedId!);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(10);
  });
});
