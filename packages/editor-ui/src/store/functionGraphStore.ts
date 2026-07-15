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
import type { CommentGroup, EdgeWaypoint, FlowEdge, FlowNode, VariableDeclaration, FunctionGraph } from "@visual-node/core";
import {
  addVariadicInputPin,
  removeVariadicInputPin,
  addSwitchCase,
  removeSwitchCase,
  updateSwitchCaseValue as updateSwitchCaseValueHelper,
  addSequencePin as addSequencePinHelper,
  removeSequencePin as removeSequencePinHelper,
  addPathExtractorParam as addPathExtractorParamHelper,
  removePathExtractorParam as removePathExtractorParamHelper,
  addCallbackArg as addCallbackArgHelper,
  removeCallbackArg as removeCallbackArgHelper,
  setPromiseAwaited as setPromiseAwaitedHelper,
} from "./variadicPins.js";
import { translateWaypoints } from "../canvas/edgeWaypoints.js";
import { withParentsBeforeChildren, reparentNode, releaseChildrenOfDeletedGroup, assignInitialMembers, findContainingGroup } from "../canvas/subflowGroups.js";

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
function generateWaypointId(): string {
  return `fgwp_${nextId++}`;
}

/**
 * A loaded function graph's node/edge/variable/waypoint ids may already contain higher
 * numbers than the shared `nextId` counter above (e.g. after a page reload restores a
 * function graph tab whose ids were generated in an earlier session). Without this, freshly
 * generated ids can collide with existing ones, giving two nodes/edges the same React key —
 * this is exactly `flowStore.ts`'s `seedIdCounters()`/`seedVariableIdCounter()`, adapted to
 * this file's single shared counter across all four id kinds.
 */
function seedNextId(nodes: Node[], edges: Edge[], variables: VariableDeclaration[]): void {
  for (const node of nodes) {
    const match = /_(\d+)$/.exec(node.id);
    if (match) nextId = Math.max(nextId, Number(match[1]) + 1);
  }
  for (const edge of edges) {
    const match = /^fgedge_(\d+)$/.exec(edge.id);
    if (match) nextId = Math.max(nextId, Number(match[1]) + 1);

    const waypoints = (edge.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints;
    if (waypoints) {
      for (const waypoint of waypoints) {
        const wMatch = /^fgwp_(\d+)$/.exec(waypoint.id);
        if (wMatch) nextId = Math.max(nextId, Number(wMatch[1]) + 1);
      }
    }
  }
  for (const variable of variables) {
    const match = /^fgvar_(\d+)$/.exec(variable.id);
    if (match) nextId = Math.max(nextId, Number(match[1]) + 1);
  }
}

export interface FunctionGraphState {
  nodes: Node[];
  edges: Edge[];
  variables: VariableDeclaration[];
  selectedNodeId: string | null;
  currentZoom: number;
  /** Mirrors flowStore.ts's identically-shaped field — which node's comment is open in the full-screen expand modal, scoped to this graph's own nodes. */
  expandedCommentField: { nodeId: string } | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: XYPosition, data: Record<string, unknown>) => void;
  selectNode: (nodeId: string | null) => void;
  setZoom: (zoom: number) => void;
  deleteSelectedNode: () => void;
  deleteEdge: (edgeId: string) => void;
  openCommentExpand: (nodeId: string) => void;
  closeCommentExpand: () => void;
  addEdgeWaypoint: (edgeId: string, index: number, point: { x: number; y: number }) => void;
  moveEdgeWaypoint: (edgeId: string, waypointId: string, point: { x: number; y: number }) => void;
  removeEdgeWaypoint: (edgeId: string, waypointId: string) => void;
  updateNodeData: (nodeId: string, key: string, value: unknown) => void;
  addInputPin: (nodeId: string) => void;
  removeInputPin: (nodeId: string, pinId: string) => void;
  addSwitchCasePin: (nodeId: string) => void;
  removeSwitchCasePin: (nodeId: string, caseId: string) => void;
  updateSwitchCaseValue: (nodeId: string, caseId: string, value: string | number | boolean) => void;
  addSequencePin: (nodeId: string) => void;
  removeSequencePin: (nodeId: string, pinId: string) => void;
  addPathExtractorParam: (nodeId: string) => void;
  removePathExtractorParam: (nodeId: string) => void;
  addCallbackArg: (nodeId: string) => void;
  removeCallbackArg: (nodeId: string, argId: string) => void;
  setPromiseAwaited: (nodeId: string, awaited: boolean) => void;
  addParam: (name: string) => void;
  removeParam: (name: string) => void;
  renameParam: (oldName: string, newName: string) => void;
  addVariable: () => void;
  renameVariable: (id: string, name: string) => void;
  setVariableKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  setVariableDataType: (id: string, dataType: VariableDeclaration["dataType"]) => void;
  setVariableDefault: (id: string, value: string) => void;
  removeVariable: (id: string) => void;
  addCommentGroup: (bounds: { x: number; y: number; width: number; height: number }, title?: string, memberIds?: string[]) => void;
  reparentNodeOnDragStop: (nodeId: string) => void;
  exportGraph: () => { nodes: FlowNode[]; edges: FlowEdge[]; variables: VariableDeclaration[]; comments?: CommentGroup[] };
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
  initialGraph: { nodes: FlowNode[]; edges: FlowEdge[]; comments?: CommentGroup[] },
  paramNames: string[],
  initialVariables: VariableDeclaration[] = [],
): FunctionGraphStore {
  // Phase 33: Convert comment groups to annotation nodes, mirroring flowStore's flowToGraph
  // Phase 34: Preserve parentId and use withParentsBeforeChildren for proper ordering
  const commentNodes: Node[] = (initialGraph.comments ?? []).map((c) => ({
    id: c.id,
    type: "annotation.commentGroup",
    position: c.position,
    width: c.width,
    height: c.height,
    zIndex: -1,
    data: { title: c.title, color: c.color, width: c.width, height: c.height },
  }));

  const seedNodes: Node[] = withParentsBeforeChildren([
    ...initialGraph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data ?? {},
      ...(n.parentId && { parentId: n.parentId }),
    })),
    ...commentNodes,
  ]);
  const seedEdges: Edge[] = initialGraph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: "flow-edge",
    data: e.waypoints ? { waypoints: e.waypoints } : undefined,
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

  seedNextId(workingNodes, workingEdges, initialVariables);

  return create<FunctionGraphState>((set, get) => ({
    nodes: workingNodes,
    edges: workingEdges,
    variables: [...initialVariables],
    selectedNodeId: null,
    currentZoom: 1,
    expandedCommentField: null,
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
      const currentNodes = get().nodes;
      const updatedNodes = applyNodeChanges(filtered, currentNodes);

      // Phase 32: when nodes move, translate their connected edges' waypoints by the same
      // delta so the anchors follow the nodes instead of staying fixed in place.
      const waypointUpdates = translateWaypoints(currentNodes, get().edges, filtered);
      let updatedEdges = get().edges;
      if (waypointUpdates.length > 0) {
        const edgeChanges: EdgeChange[] = waypointUpdates.map((update) => {
          const edge = updatedEdges.find((e) => e.id === update.id);
          return {
            type: "replace",
            id: update.id,
            item: { ...edge!, data: update.data },
          } as EdgeChange;
        });
        updatedEdges = applyEdgeChanges(edgeChanges, updatedEdges);
      }

      // Phase 33: Comment group dimension changes are real edits (user resizing) and matter
      // for re-export, unlike regular node "dimensions" changes which are just layout-driven.
      // Don't update isDirty here (this store has no isDirty concept), but do emit the changes.
      set({ nodes: updatedNodes, edges: updatedEdges });
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
    setZoom: (zoom) => set({ currentZoom: zoom }),
    // Explicit counterpart to the built-in Delete/Backspace keyboard shortcut (which already
    // cascades to connected edges via react-flow's own delete handling, same as the main
    // canvas's flowStore) — this is what the Node Config panel's "Delete" button calls,
    // mirroring `flowStore.ts`'s `deleteSelectedNode`. Guards against removing the single
    // Start entry node for the same reason `onNodesChange` above does.
    deleteSelectedNode: () => {
      const { selectedNodeId, nodes } = get();
      if (!selectedNodeId) return;
      if (nodes.find((n) => n.id === selectedNodeId)?.type === "logic.graphEntry") return;
      let updatedNodes = nodes;
      if (nodes.find((n) => n.id === selectedNodeId)?.type === "annotation.commentGroup") {
        updatedNodes = releaseChildrenOfDeletedGroup(nodes, selectedNodeId);
      }
      set({
        nodes: updatedNodes.filter((n) => n.id !== selectedNodeId),
        edges: get().edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
        selectedNodeId: null,
      });
    },
    deleteEdge: (edgeId) => set({ edges: get().edges.filter((e) => e.id !== edgeId) }),
    // Scoped counterpart to flowStore.ts's identically-named actions — see GenericNode.tsx's
    // scoped/global fallback pattern for why this needs to exist here too, not just on the
    // global store: a Comment "Expand" click inside a Function Graph tab must open against
    // this graph's own node ids, not the global flowStore's.
    openCommentExpand: (nodeId) => set({ expandedCommentField: { nodeId } }),
    closeCommentExpand: () => set({ expandedCommentField: null }),
    // Phase 31 Redirecting Wire: purely cosmetic waypoints on an edge's `data.waypoints`,
    // never read by codegen/validation — parallel to the identical trio being added to
    // flowStore.ts. addEdgeWaypoint inserts at a specific index (the double-click position
    // along the wire); move/remove operate by the waypoint's own generated id.
    addEdgeWaypoint: (edgeId, index, point) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== edgeId) return e;
          const existing = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints ?? [];
          const waypoint: EdgeWaypoint = { id: generateWaypointId(), x: point.x, y: point.y };
          const next = [...existing.slice(0, index), waypoint, ...existing.slice(index)];
          return { ...e, data: { ...e.data, waypoints: next } };
        }),
      });
    },
    moveEdgeWaypoint: (edgeId, waypointId, point) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== edgeId) return e;
          const existing = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints ?? [];
          return {
            ...e,
            data: {
              ...e.data,
              waypoints: existing.map((w) => (w.id === waypointId ? { ...w, x: point.x, y: point.y } : w)),
            },
          };
        }),
      });
    },
    removeEdgeWaypoint: (edgeId, waypointId) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== edgeId) return e;
          const existing = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints ?? [];
          return { ...e, data: { ...e.data, waypoints: existing.filter((w) => w.id !== waypointId) } };
        }),
      });
    },
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
    addSequencePin: (nodeId) => {
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? addSequencePinHelper(n) : n)) });
    },
    removeSequencePin: (nodeId, pinId) => {
      const { nodes, edges } = removeSequencePinHelper(nodeId, pinId, get().nodes, get().edges);
      set({ nodes, edges });
    },
    addPathExtractorParam: (nodeId) => {
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? addPathExtractorParamHelper(n) : n)) });
    },
    removePathExtractorParam: (nodeId) => {
      const { nodes, edges } = removePathExtractorParamHelper(nodeId, get().nodes, get().edges);
      set({ nodes, edges });
    },
    addCallbackArg: (nodeId) => {
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? addCallbackArgHelper(n) : n)) });
    },
    removeCallbackArg: (nodeId, argId) => {
      const { nodes, edges } = removeCallbackArgHelper(nodeId, argId, get().nodes, get().edges);
      set({ nodes, edges });
    },
    setPromiseAwaited: (nodeId, awaited) => {
      const { nodes, edges } = setPromiseAwaitedHelper(nodeId, awaited, get().nodes, get().edges);
      set({ nodes, edges });
    },
    updateSwitchCaseValue: (nodeId, caseId, value) => {
      set({ nodes: updateSwitchCaseValueHelper(nodeId, caseId, value, get().nodes) });
    },
    addParam: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set({
        nodes: get().nodes.map((n) => {
          if (n.type === "logic.graphEntry") {
            return { ...n, data: { ...n.data, params: [...paramsOf(n), trimmed] } };
          }
          // Also sync same-file function call nodes (recursion): append the new param
          if (n.type === "logic.functionCall" && n.data?.callKind === "sameFile") {
            const currentParams = String(n.data?.params ?? "")
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            return { ...n, data: { ...n.data, params: [...currentParams, trimmed].join(", ") } };
          }
          return n;
        }),
      });
    },
    removeParam: (name) => {
      const entry = get().nodes.find((n) => n.type === "logic.graphEntry");
      set({
        nodes: get().nodes.map((n) => {
          if (n.type === "logic.graphEntry") {
            return { ...n, data: { ...n.data, params: paramsOf(n).filter((p) => p !== name) } };
          }
          // Also sync same-file function call nodes (recursion): remove the param
          if (n.type === "logic.functionCall" && n.data?.callKind === "sameFile") {
            const currentParams = String(n.data?.params ?? "")
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            const updated = currentParams.filter((p) => p !== name);
            return { ...n, data: { ...n.data, params: updated.join(", ") } };
          }
          return n;
        }),
        edges: entry ? get().edges.filter((e) => !(e.source === entry.id && e.sourceHandle === name)) : get().edges,
      });
    },
    renameParam: (oldName, newName) => {
      const entry = get().nodes.find((n) => n.type === "logic.graphEntry");
      set({
        nodes: get().nodes.map((n) => {
          if (n.type === "logic.graphEntry") {
            return { ...n, data: { ...n.data, params: paramsOf(n).map((p) => (p === oldName ? newName : p)) } };
          }
          // Also sync same-file function call nodes (recursion): rename the param
          if (n.type === "logic.functionCall" && n.data?.callKind === "sameFile") {
            const currentParams = String(n.data?.params ?? "")
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            const updated = currentParams.map((p) => (p === oldName ? newName : p));
            return { ...n, data: { ...n.data, params: updated.join(", ") } };
          }
          return n;
        }),
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
    addCommentGroup: (bounds, title, memberIds) => {
      const node: Node = {
        id: generateNodeId("annotation.commentGroup"),
        type: "annotation.commentGroup",
        position: { x: bounds.x, y: bounds.y },
        width: bounds.width,
        height: bounds.height,
        zIndex: -1,
        data: { title: title ?? "Comment", color: "#4b4b63", width: bounds.width, height: bounds.height },
      };
      let updatedNodes = [...get().nodes, node];
      if (memberIds && memberIds.length > 0) {
        updatedNodes = assignInitialMembers(updatedNodes, node.id, memberIds);
      }
      set({ nodes: withParentsBeforeChildren(updatedNodes) });
    },
    reparentNodeOnDragStop: (nodeId) => {
      const nodes = get().nodes;
      const draggedNode = nodes.find((n) => n.id === nodeId);
      if (!draggedNode || draggedNode.type === "annotation.commentGroup") return;

      const newParentId = findContainingGroup(nodes, nodeId);
      const currentParentId = draggedNode.parentId;

      if (newParentId !== currentParentId) {
        set({
          nodes: reparentNode(nodes, nodeId, newParentId),
        });
      }
    },
    exportGraph: () => {
      // Phase 33: Partition comment-group nodes back into comments array, mirroring
      // flowStore's graphToFlow logic. Non-comment nodes go into the main nodes array.
      const flowNodes: FlowNode[] = [];
      const commentGroups: CommentGroup[] = [];

      for (const n of get().nodes) {
        if (n.type === "annotation.commentGroup") {
          const data = n.data as Record<string, any>;
          commentGroups.push({
            id: n.id,
            title: data.title ?? "Comment",
            position: n.position,
            width: n.width ?? 220,
            height: n.height ?? 120,
            color: data.color ?? "#4b4b63",
          });
        } else if (n.type) {
          // Only include nodes with a valid type (exclude React Flow-only nodes)
          flowNodes.push({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data ?? {},
            ...(n.parentId && { parentId: n.parentId }),
          });
        }
      }

      const result: ReturnType<FunctionGraphState["exportGraph"]> = {
        nodes: flowNodes,
        edges: get().edges.map((e) => {
          const waypoints = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints;
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            ...(Array.isArray(waypoints) && waypoints.length > 0 ? { waypoints } : {}),
          };
        }),
        variables: get().variables,
      };

      // Only include comments if non-empty (back-compat convention, matching flowStore/graphToFlow)
      if (commentGroups.length > 0) {
        result.comments = commentGroups;
      }

      return result;
    },
  }));
}
