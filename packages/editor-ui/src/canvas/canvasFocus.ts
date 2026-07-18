import type { ReactFlowInstance } from "@xyflow/react";

const instances = new Map<string, ReactFlowInstance>();

/**
 * Register or unregister a ReactFlow canvas instance by scope.
 * Scope "main" is the main canvas; for function graphs, use the functionNodeId.
 */
export function registerCanvasInstance(scope: string, instance: ReactFlowInstance | null): void {
  if (instance) {
    instances.set(scope, instance);
  } else {
    instances.delete(scope);
  }
}

/**
 * Selects a node and focuses the canvas on it with a smooth animation.
 * Returns true if successful, false if the canvas or node doesn't exist.
 */
export function focusNodeOnCanvas(scope: string, nodeId: string): boolean {
  const instance = instances.get(scope);
  if (!instance || !instance.getNode(nodeId)) {
    return false;
  }
  instance.setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
  instance.fitView({ nodes: [{ id: nodeId }], duration: 400, maxZoom: 1.5 });
  return true;
}
