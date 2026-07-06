import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type XYPosition,
} from "@xyflow/react";
import type { FlowEdge, FlowNode, VariableDeclaration } from "@visual-node/core";
import {
  addVariadicInputPin,
  removeVariadicInputPin,
  addSwitchCase,
  removeSwitchCase,
  updateSwitchCaseValue as updateSwitchCaseValueHelper,
} from "./variadicPins.js";

let nextId = 1;
// Prefixed distinctly from the outer flowStore's id scheme ("logic_function_1" etc.) so
// ids can never collide even though the two stores never coexist for the same node today —
// keeps the invariant true structurally, not by accident.
function generateNodeId(type: string): string {
  return `fgnode_${type.replace(/\./g, "_")}_${nextId++}`;
}
function generateEdgeId(): string {
  return `fgedge_${nextId++}`;
}
function generateVariableId(): string {
  return `fgvar_${nextId++}`;
}

export interface FunctionGraphState {
  nodes: Node[];
  edges: Edge[];
  variables: VariableDeclaration[];
  selectedNodeId: string | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: XYPosition, data: Record<string, unknown>) => void;
  selectNode: (nodeId: string | null) => void;
  deleteSelectedNode: () => void;
  deleteEdge: (edgeId: string) => void;
  updateNodeData: (nodeId: string, key: string, value: unknown) => void;
  addInputPin: (nodeId: string) => void;
  removeInputPin: (nodeId: string, pinId: string) => void;
  addSwitchCasePin: (nodeId: string) => void;
  removeSwitchCasePin: (nodeId: string, caseId: string) => void;
  updateSwitchCaseValue: (nodeId: string, caseId: string, value: string | number | boolean) => void;
  addParam: (name: string) => void;
  removeParam: (name: string) => void;
  renameParam: (oldName: string, newName: string) => void;
  addVariable: () => void;
  renameVariable: (id: string, name: string) => void;
  setVariableKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  setVariableDataType: (id: string, dataType: VariableDeclaration["dataType"]) => void;
  setVariableDefault: (id: string, value: string) => void;
  removeVariable: (id: string) => void;
  exportGraph: () => { nodes: FlowNode[]; edges: FlowEdge[]; variables: VariableDeclaration[] };
}

export type FunctionGraphStore = UseBoundStore<StoreApi<FunctionGraphState>>;

function paramsOf(node: Node): string[] {
  const params = node.data?.params;
  return Array.isArray(params) ? (params as string[]) : [];
}

/**
 * Seeds from the Function node's persisted `data.graph`, reconciling a single
 * `logic.graphEntry` node against the function's CURRENT `params` list (the outer
 * Function node's declared params always win over whatever was last saved in the
 * sub-graph): if the seed already has a `logic.graphEntry` node, its `data.params` is
 * overwritten with `paramNames` and any value-pin edge whose `sourceHandle` no longer
 * names a current param (a stale wire to a since-removed/renamed parameter) is dropped —
 * the static `"out"` execution-pin edge is exempt, since that handle is never a param
 * name to begin with. If the seed has none, one is created at a fixed position with
 * `data: { params: paramNames }`.
 * If the (untrusted, hand-edited-JSON-possible) seed somehow contains more than one
 * `logic.graphEntry` node, only the first is kept — the rest, and their edges, are
 * dropped; this store is the only thing that should ever create one, so this is purely
 * defensive. This reconciliation runs once, here, at store-creation time (i.e.
 * modal-open time) — editing the outer `params` while the modal stays open does not
 * live-resync; the user must reopen to pick up changes (documented v1 limitation, not a
 * bug). Once created, params can be added/removed/renamed in-place via the `addParam`/
 * `removeParam`/`renameParam` actions below without needing to reopen the modal.
 */
export function createFunctionGraphStore(
  initialGraph: { nodes: FlowNode[]; edges: FlowEdge[] },
  paramNames: string[],
  initialVariables: VariableDeclaration[] = [],
): FunctionGraphStore {
  const seedNodes: Node[] = initialGraph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data ?? {},
  }));
  const seedEdges: Edge[] = initialGraph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: "flow-edge",
  }));

  const entryNodes = seedNodes.filter((n) => n.type === "logic.graphEntry");
  const extraEntryIds = new Set(entryNodes.slice(1).map((n) => n.id));

  let workingNodes = seedNodes.filter((n) => !extraEntryIds.has(n.id));
  let workingEdges = seedEdges.filter((e) => !extraEntryIds.has(e.source) && !extraEntryIds.has(e.target));

  const keptEntry = entryNodes[0];
  if (keptEntry) {
    workingNodes = workingNodes.map((n) =>
      n.id === keptEntry.id ? { ...n, data: { ...n.data, params: [...paramNames] } } : n,
    );
    workingEdges = workingEdges.filter(
      (e) =>
        !(
          e.source === keptEntry.id &&
          e.sourceHandle != null &&
          e.sourceHandle !== "out" &&
          !paramNames.includes(e.sourceHandle)
        ),
    );
  } else {
    workingNodes = [
      ...workingNodes,
      {
        id: generateNodeId("logic.graphEntry"),
        type: "logic.graphEntry",
        position: { x: 40, y: 40 },
        data: { params: [...paramNames] },
      },
    ];
  }

  return create<FunctionGraphState>((set, get) => ({
    nodes: workingNodes,
    edges: workingEdges,
    variables: [...initialVariables],
    selectedNodeId: null,
    onNodesChange: (changes) => {
      // The Start entry node is managed exclusively via addParam/removeParam/renameParam
      // (surfaced through the Details panel) — dropping its "remove" change here stops a
      // stray Delete/Backspace keypress on the canvas from deleting it, which would orphan
      // every wire reading from it with no way to add a replacement (it's not offered in
      // the node picker).
      const filtered = changes.filter((change) => {
        if (change.type !== "remove") return true;
        return get().nodes.find((n) => n.id === change.id)?.type !== "logic.graphEntry";
      });
      set({ nodes: applyNodeChanges(filtered, get().nodes) });
    },
    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
    // Same self-connection guard as flowStore.ts's onConnect — a node can never legally wire
    // one of its own pins back into another pin on itself.
    onConnect: (connection) => {
      if (connection.source === connection.target) return;
      set({ edges: addEdge({ ...connection, id: generateEdgeId(), type: "flow-edge" }, get().edges) });
    },
    addNode: (type, position, data) => {
      set({ nodes: [...get().nodes, { id: generateNodeId(type), type, position, data }] });
    },
    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
    // Explicit counterpart to the built-in Delete/Backspace keyboard shortcut (which already
    // cascades to connected edges via react-flow's own delete handling, same as the main
    // canvas's flowStore) — this is what the Node Config panel's "Delete" button calls,
    // mirroring `flowStore.ts`'s `deleteSelectedNode`. Guards against removing the single
    // Start entry node for the same reason `onNodesChange` above does.
    deleteSelectedNode: () => {
      const { selectedNodeId, nodes } = get();
      if (!selectedNodeId) return;
      if (nodes.find((n) => n.id === selectedNodeId)?.type === "logic.graphEntry") return;
      set({
        nodes: nodes.filter((n) => n.id !== selectedNodeId),
        edges: get().edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
        selectedNodeId: null,
      });
    },
    deleteEdge: (edgeId) => set({ edges: get().edges.filter((e) => e.id !== edgeId) }),
    updateNodeData: (nodeId, key, value) => {
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n)) });
    },
    // Same operator/control-flow dynamic-pin actions as flowStore.ts's, for parity inside a
    // Function Graph's nested canvas — thin wrappers around variadicPins.ts's pure helpers.
    addInputPin: (nodeId) => {
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? addVariadicInputPin(n) : n)) });
    },
    removeInputPin: (nodeId, pinId) => {
      const { nodes, edges } = removeVariadicInputPin(nodeId, pinId, get().nodes, get().edges);
      set({ nodes, edges });
    },
    addSwitchCasePin: (nodeId) => {
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? addSwitchCase(n) : n)) });
    },
    removeSwitchCasePin: (nodeId, caseId) => {
      const { nodes, edges } = removeSwitchCase(nodeId, caseId, get().nodes, get().edges);
      set({ nodes, edges });
    },
    updateSwitchCaseValue: (nodeId, caseId, value) => {
      set({ nodes: updateSwitchCaseValueHelper(nodeId, caseId, value, get().nodes) });
    },
    addParam: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set({
        nodes: get().nodes.map((n) =>
          n.type === "logic.graphEntry"
            ? { ...n, data: { ...n.data, params: [...paramsOf(n), trimmed] } }
            : n,
        ),
      });
    },
    removeParam: (name) => {
      const entry = get().nodes.find((n) => n.type === "logic.graphEntry");
      set({
        nodes: get().nodes.map((n) =>
          n.type === "logic.graphEntry"
            ? { ...n, data: { ...n.data, params: paramsOf(n).filter((p) => p !== name) } }
            : n,
        ),
        edges: entry ? get().edges.filter((e) => !(e.source === entry.id && e.sourceHandle === name)) : get().edges,
      });
    },
    renameParam: (oldName, newName) => {
      const entry = get().nodes.find((n) => n.type === "logic.graphEntry");
      set({
        nodes: get().nodes.map((n) =>
          n.type === "logic.graphEntry"
            ? { ...n, data: { ...n.data, params: paramsOf(n).map((p) => (p === oldName ? newName : p)) } }
            : n,
        ),
        edges: entry
          ? get().edges.map((e) =>
              e.source === entry.id && e.sourceHandle === oldName ? { ...e, sourceHandle: newName } : e,
            )
          : get().edges,
      });
    },
    // Phase 10 Variables, function-scoped counterpart to flowStore.ts's identically-named
    // actions — same shape, same "no cascade-delete on remove" behavior, just scoped to
    // this graph's own `variables` list instead of the main canvas's. No isDirty/
    // runValidation bookkeeping here: this store has neither concept (Save & Close's
    // `exportGraph()` -> `updateNodeConfig(..., "graph", ...)` is what flips the outer
    // flowStore's isDirty, same as every other function-graph edit).
    addVariable: () => {
      const { variables } = get();
      const existingNames = new Set(variables.map((v) => v.name));
      let name = "variable";
      let suffix = 1;
      while (existingNames.has(name)) {
        suffix += 1;
        name = `variable${suffix}`;
      }
      const variable: VariableDeclaration = {
        id: generateVariableId(),
        name,
        keyword: "let",
        dataType: "string",
        defaultValue: "",
      };
      set({ variables: [...variables, variable] });
    },
    renameVariable: (id, name) => {
      set({ variables: get().variables.map((v) => (v.id === id ? { ...v, name } : v)) });
    },
    setVariableKeyword: (id, keyword) => {
      set({ variables: get().variables.map((v) => (v.id === id ? { ...v, keyword } : v)) });
    },
    setVariableDataType: (id, dataType) => {
      set({ variables: get().variables.map((v) => (v.id === id ? { ...v, dataType } : v)) });
    },
    setVariableDefault: (id, value) => {
      set({ variables: get().variables.map((v) => (v.id === id ? { ...v, defaultValue: value } : v)) });
    },
    removeVariable: (id) => {
      set({ variables: get().variables.filter((v) => v.id !== id) });
    },
    exportGraph: () => ({
      nodes: get().nodes.map((n) => ({ id: n.id, type: n.type!, position: n.position, data: n.data ?? {} })),
      edges: get().edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
      variables: get().variables,
    }),
  }));
}
