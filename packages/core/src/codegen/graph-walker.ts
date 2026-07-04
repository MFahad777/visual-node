import type { Flow, FlowNode } from "../schema/node.types.js";
import { requireNodeDefinition } from "../schema/node-registry.js";
import { execEntryPort } from "./exec-chain.js";
import { CycleError, topologicalSort } from "./topo-sort.js";

/**
 * Topologically sorts the "structural" nodes of a flow (server/routing/middleware
 * categories) so codegen can emit them in dependency order. Handler-category nodes
 * are excluded: they never appear at the top level of a generated file, they're only
 * pulled in by the route node that owns their chain.
 */
const STRUCTURAL_CATEGORIES = new Set(["server", "routing", "middleware"]);

export function topologicalSortStructuralNodes(flow: Flow): FlowNode[] {
  const allStructural = flow.nodes.filter((n) => STRUCTURAL_CATEGORIES.has(requireNodeDefinition(n.type).category));
  const allStructuralIds = new Set(allStructural.map((n) => n.id));

  const fullAdjacency = new Map<string, string[]>();
  for (const node of allStructural) fullAdjacency.set(node.id, []);
  for (const edge of flow.edges) {
    if (!allStructuralIds.has(edge.source) || !allStructuralIds.has(edge.target)) continue;
    fullAdjacency.get(edge.source)!.push(edge.target);
  }

  // A node dropped on the canvas but never wired to anything has no effect on the
  // generated server — only nodes reachable from express.init are actually part of the
  // deployed graph. Without this, an orphaned node (e.g. a middleware node the user
  // hasn't connected yet) would still have its in-degree of 0 mistaken for "runs first"
  // and get emitted, silently doing something the canvas doesn't show as wired up.
  const initNode = allStructural.find((n) => n.type === "express.init");
  const reachable = new Set<string>();
  if (initNode) {
    const stack = [initNode.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const next of fullAdjacency.get(id) ?? []) stack.push(next);
    }
  }

  const structural = allStructural.filter((n) => reachable.has(n.id));

  let sortedIds: string[];
  try {
    sortedIds = topologicalSort(structural.map((n) => n.id), flow.edges);
  } catch (err) {
    if (err instanceof CycleError) {
      throw new Error("Flow graph contains a cycle among structural nodes; cannot determine emission order");
    }
    throw err;
  }

  const nodesById = new Map(structural.map((n) => [n.id, n]));
  return sortedIds.map((id) => nodesById.get(id)!);
}

/**
 * Returns every "logic" category node in the flow (Function/Export/Require declarations).
 * Unlike structural nodes, logic nodes are free-standing declarations with no App-chain
 * ports — they are never reachable from `express.init` by design, so they must NOT go
 * through the reachability gate above. Presence in `flow.nodes` is itself the inclusion
 * signal: a private (non-exported) helper Function referenced by same-file raw code must
 * still be emitted, or that code throws a ReferenceError at runtime.
 *
 * Exception (Phase 10): a "logic" node that declares an *explicit* `kind: "exec"` entry input
 * port (today, only `variable.set`) is a chain PARTICIPANT, not a free-standing declaration —
 * it must be discovered via the Route/Function exec-chain walk (like `debug.consoleLog`), never
 * unconditionally collected here. Without this, an unwired `variable.set` node would have its
 * `emit()` called at file-assembly time even though it's not part of any chain, throwing a
 * spurious "value pin not connected" error for a node that should simply be ignored.
 *
 * Deliberately checks `execEntryPort(def)?.kind === "exec"` rather than just
 * `execEntryPort(def) !== undefined`: `execEntryPort`'s legacy `id === "in"` fallback (kept for
 * pre-Phase-7 node types that predate the exec/value `kind` distinction) also coincidentally
 * matches `logic.export`'s "in" port — which accepts multiple wires and isn't an execution
 * predecessor at all (Export has no "out" pin and is never walked into by the exec-chain
 * machinery). Found via a real regression: excluding on the loose check silently dropped
 * `module.exports` from every generated file with an Export node. Every genuine Phase 7+
 * exec-entry pin (including `variable.set`'s, and every plugin exec-entry pin — `plugin-schema.ts`
 * requires plugins to declare `kind` explicitly) sets `kind: "exec"`, so requiring an explicit
 * match here is strictly correct without reintroducing a category allow-list.
 */
export function collectLogicNodes(flow: Flow): FlowNode[] {
  return flow.nodes.filter((n) => {
    const def = requireNodeDefinition(n.type);
    if (def.category !== "logic") return false;
    return execEntryPort(def)?.kind !== "exec";
  });
}
