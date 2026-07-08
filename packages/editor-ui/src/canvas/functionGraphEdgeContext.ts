import { createContext, useContext } from "react";
import type { VariableDeclaration } from "@visual-node/core";

export interface FunctionGraphEdgeContextValue {
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>;
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
  // Present only inside a Function node's blueprint sub-canvas (FunctionGraphModal wires
  // these to the scoped functionGraphStore instance) — GenericNode.tsx prefers these over
  // the global flowStore's equivalents when this context is provided, mirroring how it
  // already prefers `edges`/`nodes` here over the global store.
  updateNodeData?: (nodeId: string, key: string, value: unknown) => void;
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
}

/**
 * `CustomEdge` is shared between the main canvas (bound to the global `flowStore`) and a
 * Function node's blueprint sub-canvas (bound to a per-modal `functionGraphStore` instance —
 * see `functionGraphStore.ts`). Reading `useFlowStore` directly for edges/nodes/`deleteEdge`
 * silently no-ops inside the sub-canvas: a `fgedge_*`/`fgnode_*` id never matches anything in
 * the global store, so the wire never renders its exec/category color correctly and its
 * "Disconnect" button does nothing. `FunctionGraphModal` provides this context with the local
 * store's data so `CustomEdge` can prefer it, the same fallback pattern
 * `functionGraphNodeDefinitions.ts` already uses for node definitions; the main canvas never
 * provides it, so `CustomEdge` falls back to the global store there, unchanged.
 */
export const FunctionGraphEdgeContext = createContext<FunctionGraphEdgeContextValue | null>(null);

export function useFunctionGraphEdgeContext(): FunctionGraphEdgeContextValue | null {
  return useContext(FunctionGraphEdgeContext);
}
