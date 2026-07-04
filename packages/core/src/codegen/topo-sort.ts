/**
 * Generic Kahn's-algorithm topological sort over a set of node ids and directed edges
 * between them. Shared by the top-level structural-node sort (`graph-walker.ts`) and the
 * function-graph body compiler (`emit-function-graph.ts`) — both are plain "order these
 * ids by these edges" problems with no category-specific behavior in the algorithm itself.
 */
export class CycleError extends Error {
  constructor(public readonly remainingNodeIds: string[]) {
    super(`Cycle detected among nodes: ${remainingNodeIds.join(", ")}`);
  }
}

export function topologicalSort(nodeIds: string[], edges: Array<{ source: string; target: string }>): string[] {
  const idSet = new Set(nodeIds);
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = nodeIds.filter((id) => inDegree.get(id) === 0);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (sorted.length !== nodeIds.length) {
    const sortedSet = new Set(sorted);
    throw new CycleError(nodeIds.filter((id) => !sortedSet.has(id)));
  }

  return sorted;
}
