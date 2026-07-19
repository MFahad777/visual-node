import { createContext, useContext } from "react";
import type { VariableDeclaration } from "@visual-node/core";

export interface FunctionGraphEdgeContextValue {
  // Widened to include `data` (type-only change — the real object passed in is always the
  // full react-flow `Edge[]`): CustomEdge needs `edge.data.waypoints` reachable through this
  // scoped path (Phase 31), the same way it already reaches `sourceHandle`/`targetHandle`.
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    data?: Record<string, unknown>;
  }>;
  // Widened to include `data` (type-only change — the real object passed in is always the
  // full react-flow `Node[]`): CustomEdge needs a source/target node's `data` to resolve its
  // effective ports (computeEffectiveOutputs/computeEffectiveInputs) for exec-vs-value wire
  // coloring, and GenericNode's dynamic-pin actions below need it for the same reason.
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
  deleteEdge: (edgeId: string) => void;
  // Phase 10: this Function's own scoped variable list, mirroring the edges/nodes
  // scoped/global fallback pattern below — GenericNode.tsx's summarize() needs it to
  // resolve a `variable.get`/`variable.set` node's bound `data.variableId` to a display
  // name inside a Function's blueprint sub-canvas, where the main canvas's `flowStore`
  // variables would be the wrong (and namespace-unrelated) list to look up against.
  variables?: VariableDeclaration[];
  // Phase 25: the outer/main-canvas module-level variable list, kept separate from `variables`
  // above (rather than pre-merged) so a lookup can check local first and fall back to module —
  // the same local-wins-on-id-collision precedence `emit-function-graph.ts`'s
  // `buildGraphEmitContext()` uses at the codegen layer. Lets `GenericNode.tsx` resolve a
  // `variable.get`/`variable.set` node bound to a module-level variable (Phase 24 already
  // allows this at the codegen level; before this field existed the UI had no way to find it).
  moduleVariables?: VariableDeclaration[];
  // Present only inside a Function node's blueprint sub-canvas (FunctionGraphTabView wires
  // these to the scoped functionGraphStore instance) — GenericNode.tsx prefers these over
  // the global flowStore's equivalents when this context is provided, mirroring how it
  // already prefers `edges`/`nodes` here over the global store.
  updateNodeData?: (nodeId: string, key: string, value: unknown) => void;
  // Present only inside a Function node's blueprint sub-canvas, mirroring `updateNodeData`
  // above — GenericNode.tsx's Comment "Expand" button must open the scoped functionGraphStore's
  // own expandedCommentField, not the global flowStore's, or the modal looks up a node id that
  // doesn't exist there and silently no-ops.
  openCommentExpand?: (nodeId: string) => void;
  addInputPin?: (nodeId: string) => void;
  removeInputPin?: (nodeId: string, pinId: string) => void;
  addSwitchCasePin?: (nodeId: string) => void;
  removeSwitchCasePin?: (nodeId: string, caseId: string) => void;
  updateSwitchCaseValue?: (nodeId: string, caseId: string, value: string | number | boolean) => void;
  addSequencePin?: (nodeId: string) => void;
  removeSequencePin?: (nodeId: string, pinId: string) => void;
  addPathExtractorParam?: (nodeId: string) => void;
  removePathExtractorParam?: (nodeId: string) => void;
  addCallbackArg?: (nodeId: string) => void;
  removeCallbackArg?: (nodeId: string, argId: string) => void;
  addObjectAssignSource?: (nodeId: string) => void;
  removeObjectAssignSource?: (nodeId: string, sourceId: string) => void;
  // Phase 31: back the draggable/removable wire-anchor (waypoint) feature. Only present
  // inside a Function Graph sub-canvas — the main canvas calls the global `useFlowStore`'s
  // equivalents instead, same fallback pattern as `deleteEdge` above.
  addEdgeWaypoint?: (edgeId: string, index: number, point: { x: number; y: number }) => void;
  moveEdgeWaypoint?: (edgeId: string, waypointId: string, point: { x: number; y: number }) => void;
  removeEdgeWaypoint?: (edgeId: string, waypointId: string) => void;
  // Current zoom level of the function graph's canvas, read from the scoped functionGraphStore
  currentZoom?: number;
}

/**
 * `CustomEdge` is shared between the main canvas (bound to the global `flowStore`) and a
 * Function node's blueprint sub-canvas (bound to a per-modal `functionGraphStore` instance —
 * see `functionGraphStore.ts`). Reading `useFlowStore` directly for edges/nodes/`deleteEdge`
 * silently no-ops inside the sub-canvas: a `fgedge_*`/`fgnode_*` id never matches anything in
 * the global store, so the wire never renders its exec/category color correctly and its
 * "Disconnect" button does nothing. `FunctionGraphTabView` provides this context with the local
 * store's data so `CustomEdge` can prefer it, the same fallback pattern
 * `functionGraphNodeDefinitions.ts` already uses for node definitions; the main canvas never
 * provides it, so `CustomEdge` falls back to the global store there, unchanged.
 */
export const FunctionGraphEdgeContext = createContext<FunctionGraphEdgeContextValue | null>(null);

export function useFunctionGraphEdgeContext(): FunctionGraphEdgeContextValue | null {
  return useContext(FunctionGraphEdgeContext);
}
