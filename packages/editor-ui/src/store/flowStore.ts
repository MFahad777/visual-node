import { create } from "zustand";
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
import type { EdgeWaypoint, Flow, NodeDefinition, ValidationError, VariableDeclaration } from "@visual-node/core";
import * as api from "../api/client.js";
import type { CompiledFile, ProjectFileError, WrittenFile, ProjectSettings } from "../api/client.js";
import { flowToGraph, graphToFlow } from "./adapters.js";
import { useEditorTabsStore } from "./editorTabsStore.js";
import type { ResolvedFunction } from "../lib/resolveRequiredFunctions.js";
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
  setFunctionUsage as setFunctionUsageHelper,
  setPromiseAwaited as setPromiseAwaitedHelper,
} from "./variadicPins.js";
import { defaultLiteralsFor, type FunctionUsage } from "../canvas/effectivePorts.js";
import { translateWaypoints } from "../canvas/edgeWaypoints.js";
import { reparentNode, releaseChildrenOfDeletedGroup, assignInitialMembers, withParentsBeforeChildren, findContainingGroup } from "../canvas/subflowGroups.js";

let nextNodeId = 1;
function generateNodeId(type: string): string {
  return `${type.replace(/\./g, "_")}_${nextNodeId++}`;
}

let nextEdgeId = 1;
function generateEdgeId(): string {
  return `edge_${nextEdgeId++}`;
}

let nextVariableId = 1;
function generateVariableId(): string {
  return `variable_${nextVariableId++}`;
}

let nextWaypointId = 1;
function generateWaypointId(): string {
  return `waypoint_${nextWaypointId++}`;
}

/**
 * A loaded flow's node/edge ids may already contain higher numbers than these
 * module-level counters (e.g. after a page reload restores a flow saved in an earlier
 * session). Without this, freshly generated ids can collide with existing ones, giving
 * two nodes/edges the same React key and corrupting rendering.
 */
function seedIdCounters(nodes: Node[], edges: Edge[]): void {
  for (const node of nodes) {
    const match = /_(\d+)$/.exec(node.id);
    if (match) nextNodeId = Math.max(nextNodeId, Number(match[1]) + 1);
  }
  for (const edge of edges) {
    const match = /^edge_(\d+)$/.exec(edge.id);
    if (match) nextEdgeId = Math.max(nextEdgeId, Number(match[1]) + 1);

    // Phase 31 reroute waypoints: stashed in edge.data.waypoints (not a first-class React
    // Flow Edge field), so most edges won't have any — guard against missing data/waypoints.
    const waypoints = (edge.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints;
    if (waypoints) {
      for (const waypoint of waypoints) {
        const wMatch = /_(\d+)$/.exec(waypoint.id);
        if (wMatch) nextWaypointId = Math.max(nextWaypointId, Number(wMatch[1]) + 1);
      }
    }
  }
}

/** Same rationale as `seedIdCounters` above, for `flow.variables` loaded from disk. */
function seedVariableIdCounter(variables: VariableDeclaration[]): void {
  for (const variable of variables) {
    const match = /_(\d+)$/.exec(variable.id);
    if (match) nextVariableId = Math.max(nextVariableId, Number(match[1]) + 1);
  }
}

const INITIAL_META: Flow["meta"] = { name: "visual-node-app", target: "express" };

/**
 * A Function Call node's `resultVariable` shares the same top-level-binding namespace as
 * Function names and Require variable names (see validate.ts's dedup check) — generating
 * a colliding default would hand the user an immediate validation error on add.
 */
function collectExistingBindingNames(nodes: Node[]): Set<string> {
  const names = new Set<string>();
  for (const n of nodes) {
    if (n.type === "logic.function") names.add(String(n.data?.name ?? "").trim());
    else if (n.type === "logic.require") names.add(String(n.data?.variableName ?? "").trim());
    else if (n.type === "logic.functionCall") names.add(String(n.data?.resultVariable ?? "").trim());
  }
  names.delete("");
  return names;
}

function generateUniqueResultVariable(functionName: string, nodes: Node[]): string {
  const existing = collectExistingBindingNames(nodes);
  const base = `${functionName}Result`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}${suffix}`)) suffix++;
  return `${base}${suffix}`;
}

/**
 * `logic.promise` has no user-facing "Name" concept in codegen (the executor is an anonymous
 * callback) — the Function Details sidebar's Name field is purely a display label so multiple
 * Promise nodes stay distinguishable at a glance. Auto-seeded at creation time so it's never
 * blank, unique against every other Promise node in the given pool. Exported (and loosely typed
 * — just `type`/`data`, not a full `@xyflow/react` `Node`) so `FunctionGraphNodePicker.tsx` and
 * `FunctionGraphSidePanel.tsx` can reuse the exact same generation/uniqueness logic for Promise
 * nodes created or renamed inside a nested Blueprint graph, instead of duplicating it.
 *
 * Uses a random suffix rather than a sequential counter: a nested Blueprint graph's node pool
 * starts empty, independent of its parent's, so a sequential `promise_1`, `promise_2`, ...
 * counter would restart from `promise_1` in every nested graph and collide with an ancestor's
 * name in the tab breadcrumb (e.g. "promise_1 > promise_1"). A random suffix makes that
 * collision very unlikely without needing cross-scope name coordination.
 */
export function generateUniquePromiseName(nodes: Array<{ type?: string; data?: Record<string, unknown> }>): string {
  const existing = new Set(
    nodes.filter((n) => n.type === "logic.promise").map((n) => String(n.data?.name ?? "").trim()),
  );
  const makeName = () => `promise_${Date.now()}_${Math.floor(Math.random() * 90000 + 10000)}`;
  let name = makeName();
  while (existing.has(name)) {
    name = makeName();
  }
  return name;
}

export interface FlowStoreState {
  nodes: Node[];
  edges: Edge[];
  meta: Flow["meta"];
  variables: VariableDeclaration[];

  currentFilePath: string | null;

  nodeDefinitions: Record<string, NodeDefinition>;

  selectedNodeId: string | null;
  currentZoom: number;

  validationErrors: ValidationError[];
  validationErrorsByNodeId: Map<string, ValidationError[]>;

  compiledResults: CompiledFile[] | null;
  compileErrors: ProjectFileError[];
  projectRevision: number;
  compiledAtRevision: number | null;
  isCompiling: boolean;
  isWritingAll: boolean;
  isWritingChecked: boolean;
  lastWrittenFiles: WrittenFile[] | null;
  selectedPreviewFile: string | null;
  // Files checked in CodePreviewModal's file list for "Write Selected Files to Disk" —
  // independent of `selectedPreviewFile` (which just controls the code-viewer pane).
  checkedPreviewFiles: Set<string>;
  isPreviewOpen: boolean;
  isNodeBrowserOpen: boolean;
  isErrorLogOpen: boolean;

  expandedCodeField: { nodeId: string; fieldKey: string; fieldLabel: string } | null;
  expandedCommentField: { nodeId: string } | null;

  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  lastError: string | null;

  isServerRunning: boolean;
  isStartingServer: boolean;
  isStoppingServer: boolean;
  serverLogs: string[];

  projectSettings: ProjectSettings | null;
  isSettingsOpen: boolean;
  projectDir: string | null;

  bootstrap: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNodeFromPalette: (type: string, position: XYPosition, extraData?: Record<string, unknown>) => void;
  addNodeFromBrowser: (type: string, extraData?: Record<string, unknown>) => void;
  addFunctionCallNode: (entry: ResolvedFunction, position?: XYPosition) => void;
  addVariableNode: (variableId: string, kind: "get" | "set", position: XYPosition) => void;
  openNodeBrowser: () => void;
  closeNodeBrowser: () => void;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
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
  setFunctionUsage: (nodeId: string, usage: FunctionUsage) => void;
  setPromiseAwaited: (nodeId: string, awaited: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  setZoom: (zoom: number) => void;
  deleteSelectedNode: () => void;
  deleteEdge: (edgeId: string) => void;
  addEdgeWaypoint: (edgeId: string, index: number, point: { x: number; y: number }) => void;
  moveEdgeWaypoint: (edgeId: string, waypointId: string, point: { x: number; y: number }) => void;
  removeEdgeWaypoint: (edgeId: string, waypointId: string) => void;

  addVariable: () => void;
  renameVariable: (id: string, name: string) => void;
  setVariableKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  setVariableDataType: (id: string, dataType: VariableDeclaration["dataType"]) => void;
  setVariableDefault: (id: string, value: string) => void;
  removeVariable: (id: string) => void;

  addCommentGroup: (bounds: { x: number; y: number; width: number; height: number }, title?: string, memberIds?: string[]) => void;
  reparentNodeOnDragStop: (nodeId: string) => void;

  saveFlow: () => Promise<void>;
  runValidation: () => Promise<void>;
  bumpProjectRevision: () => void;
  compileProject: () => Promise<void>;
  writeProjectToDisk: () => Promise<boolean>;
  writeCheckedFilesToDisk: () => Promise<boolean>;
  toggleCheckedPreviewFile: (relativePath: string) => void;
  setAllCheckedPreviewFiles: (checked: boolean) => void;
  selectPreviewFile: (relativePath: string) => void;
  closePreview: () => void;
  toggleErrorLog: () => void;
  closeErrorLog: () => void;
  openCodeExpand: (nodeId: string, fieldKey: string, fieldLabel: string) => void;
  closeCodeExpand: () => void;
  openCommentExpand: (nodeId: string) => void;
  closeCommentExpand: () => void;

  startServer: () => Promise<boolean>;
  stopServer: () => Promise<void>;

  loadProjectSettings: () => Promise<void>;
  saveProjectSettings: (settings: ProjectSettings) => Promise<string[]>;
  openSettings: () => void;
  closeSettings: () => void;

  installPlugin: (bytes: Uint8Array) => Promise<boolean>;
}

/** A2: group validation errors by node ID into a Map for O(1) lookup per node, avoiding the
 * allocation of a fresh array on every GenericNode render and defeating Zustand's
 * reference-equality selector bailout. */
function groupErrorsByNodeId(errors: ValidationError[]): Map<string, ValidationError[]> {
  const grouped = new Map<string, ValidationError[]>();
  for (const error of errors) {
    const nodeId = error.nodeId || "";
    if (!grouped.has(nodeId)) {
      grouped.set(nodeId, []);
    }
    grouped.get(nodeId)!.push(error);
  }
  return grouped;
}

/** Shared by `bootstrap()` and `installPlugin()` — both need to (re)fetch the full node
 * registry and reindex it by type. Factored out so a freshly installed plugin node can be
 * made visible immediately without duplicating this fetch-and-set logic. */
async function refreshNodeRegistry(set: (partial: Partial<FlowStoreState>) => void): Promise<void> {
  const result = await api.fetchNodeRegistry();
  const nodeDefinitions = Object.fromEntries(result.definitions.map((d) => [d.type, d]));
  set({ nodeDefinitions, projectDir: result.projectDir });
}

const MAX_CLIENT_LOG_LINES = 500;

let validationTimer: ReturnType<typeof setTimeout> | undefined;
let closeLogStream: (() => void) | undefined;

export function selectIsCompileStale(state: FlowStoreState): boolean {
  return state.compiledAtRevision !== state.projectRevision;
}

export const useFlowStore = create<FlowStoreState>((set, get) => ({
  nodes: [],
  edges: [],
  meta: INITIAL_META,
  variables: [],

  currentFilePath: null,

  nodeDefinitions: {},

  selectedNodeId: null,
  currentZoom: 1,

  validationErrors: [],
  validationErrorsByNodeId: new Map(),

  compiledResults: null,
  compileErrors: [],
  projectRevision: 0,
  compiledAtRevision: null,
  isCompiling: false,
  isWritingAll: false,
  isWritingChecked: false,
  lastWrittenFiles: null,
  selectedPreviewFile: null,
  checkedPreviewFiles: new Set(),
  isPreviewOpen: false,
  isNodeBrowserOpen: false,
  isErrorLogOpen: false,

  expandedCodeField: null,
  expandedCommentField: null,

  isLoading: false,
  isSaving: false,
  isDirty: false,
  lastError: null,

  isServerRunning: false,
  isStartingServer: false,
  isStoppingServer: false,
  serverLogs: [],

  projectSettings: null,
  isSettingsOpen: false,
  projectDir: null,

  bootstrap: async () => {
    set({ isLoading: true, lastError: null });
    try {
      await refreshNodeRegistry(set);
      await get().loadProjectSettings();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, lastError: (err as Error).message });
    }
  },

  openFile: async (path) => {
    if (get().isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes in the current file. Discard them and switch?",
      );
      if (!confirmed) return;
    }

    // Open function-graph tabs reference node ids scoped to the flow being replaced — they
    // can't carry over to whatever file loads next.
    useEditorTabsStore.getState().closeAllFunctionGraphTabs();

    set({ isLoading: true, lastError: null });
    try {
      const flow = await api.fetchBlueprint(path);
      const { nodes, edges } = flowToGraph(flow);
      seedIdCounters(nodes, edges);
      const variables = flow.variables ?? [];
      seedVariableIdCounter(variables);
      set({
        nodes,
        edges,
        meta: flow.meta,
        variables,
        currentFilePath: path,
        selectedNodeId: null,
        validationErrors: [],
        isDirty: false,
        isLoading: false,
      });
      void get().runValidation();
    } catch (err) {
      set({ isLoading: false, lastError: (err as Error).message });
    }
  },

  closeFile: () => {
    useEditorTabsStore.getState().closeAllFunctionGraphTabs();
    set({
      nodes: [],
      edges: [],
      meta: INITIAL_META,
      variables: [],
      currentFilePath: null,
      selectedNodeId: null,
      validationErrors: [],
      validationErrorsByNodeId: new Map(),
      isDirty: false,
    });
  },

  onNodesChange: (changes) => {
    // React Flow fires "select" changes on click and "dimensions" changes whenever a
    // node's DOM element is (re)measured (e.g. on selection outline, on mount) — neither
    // is an actual edit to the flow's content, so they must not flip isDirty and trigger
    // a spurious "Save*"/"discard unsaved changes?" prompt. Exception: Phase 33 comment
    // group nodes' dimension changes are real edits (user resizing the box) and must be marked dirty.
    const currentNodes = get().nodes;
    const hasContentChange = changes.some((c) => {
      if (c.type !== "select" && c.type !== "dimensions") return true;
      // Comment group dimension changes are always real edits (user resizing via NodeResizer)
      if (c.type === "dimensions" && "id" in c) {
        const node = currentNodes.find((n) => n.id === c.id);
        if (node?.type === "annotation.commentGroup") return true;
      }
      return false;
    });
    const updatedNodes = applyNodeChanges(changes, currentNodes);

    // Phase 32: when nodes move, translate their connected edges' waypoints by the same
    // delta so the anchors follow the nodes instead of staying fixed in place.
    const waypointUpdates = translateWaypoints(currentNodes, get().edges, changes);
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

    set({
      nodes: updatedNodes,
      edges: updatedEdges,
      isDirty: get().isDirty || hasContentChange,
    });
    get().runValidation();
  },

  onEdgesChange: (changes) => {
    const hasContentChange = changes.some((c) => c.type !== "select");
    set({
      edges: applyEdgeChanges(changes, get().edges),
      isDirty: get().isDirty || hasContentChange,
    });
    get().runValidation();
  },

  onConnect: (connection) => {
    // A node can never legally wire one of its own pins back into another pin on itself —
    // that's a 1-node cycle regardless of which two pins, and `validate.ts`'s `detectCycle`
    // already rejects it, but only after the fact (a "Flow graph contains a cycle" error with
    // no indication of which wire caused it). Refusing the connection here means it's simply
    // never drawable in the first place, for any node type, any pin combination.
    if (connection.source === connection.target) return;
    set({
      edges: addEdge({ ...connection, id: generateEdgeId(), type: "flow-edge" }, get().edges),
      isDirty: true,
    });
    get().runValidation();
  },

  addNodeFromPalette: (type, position, extraData) => {
    const definition = get().nodeDefinitions[type];
    if (!definition) return;

    const data: Record<string, unknown> = Object.fromEntries(definition.configSchema.map((f) => [f.key, f.default]));
    // Operators/Branch/Switch render an inline literal box (default 0/false) on every
    // unwired value pin — seed data.literals to match so a freshly-added node's data isn't
    // immediately out of sync with what's displayed (see effectivePorts.ts's
    // defaultLiteralsFor doc comment for why this matters for validation).
    const literals = defaultLiteralsFor(type, definition);
    if (literals) data.literals = literals;
    if (type === "logic.promise") data.name = generateUniquePromiseName(get().nodes);
    // `extraData` (e.g. `logic.function`'s `{ usage: "callback" | "standalone" }` from
    // FunctionUsageMenu) overrides configSchema defaults — applied last so it always wins.
    if (extraData) Object.assign(data, extraData);
    const node: Node = { id: generateNodeId(type), type, position, data };

    set({ nodes: [...get().nodes, node], isDirty: true });
    get().runValidation();
  },

  // Used by the node-browser modal, which — unlike a canvas right-click or a
  // sidebar drag — has no cursor position to place the new node at. Cascades
  // placement in a grid based on the current node count so repeated adds
  // don't overlap; steps are wider than GenericNode's min-w-[190px] so cards
  // never overlap regardless of a node's port count.
  addNodeFromBrowser: (type, extraData) => {
    const index = get().nodes.length;
    const position: XYPosition = { x: 120 + (index % 4) * 260, y: 100 + Math.floor(index / 4) * 180 };
    get().addNodeFromPalette(type, position, extraData);
  },

  // Function Call nodes aren't in `nodeDefinitions` config-schema-driven defaults —
  // their data is fully pre-populated from a resolved exported function (picked via
  // search or drag), never hand-configured from a blank instance. `position` is passed
  // explicitly by the right-click picker (which has a cursor position); omitted by the
  // browser modal, which falls back to the same cascading grid as `addNodeFromBrowser`.
  addFunctionCallNode: (entry, position) => {
    const { nodes } = get();
    const resolvedPosition =
      position ??
      { x: 120 + (nodes.length % 4) * 260, y: 100 + Math.floor(nodes.length / 4) * 180 };

    const node: Node = {
      id: generateNodeId("logic.functionCall"),
      type: "logic.functionCall",
      position: resolvedPosition,
      data: {
        requirePath: entry.requirePath,
        variableName: entry.variableName,
        functionName: entry.functionName,
        params: entry.params,
        resultVariable: generateUniqueResultVariable(entry.functionName, nodes),
      },
    };

    set({ nodes: [...nodes, node], isDirty: true });
    get().runValidation();
  },

  // Backs the Variables panel's drag-to-canvas flow (FlowCanvas.tsx's onDrop ->
  // VariableDropMenu -> here): unlike addNodeFromPalette, a variable.get/variable.set
  // node's data is fully known up front (just the bound variableId) and isn't driven by
  // any nodeDefinitions configSchema default, so this is its own small action rather than
  // a branch inside addNodeFromPalette.
  addVariableNode: (variableId, kind, position) => {
    const type = kind === "get" ? "variable.get" : "variable.set";
    const data: Record<string, unknown> = { variableId };
    // Same "seed data.literals to match what the unwired pin box displays" reasoning as
    // addNodeFromPalette above — variable.set's "value" pin is a TEXT_LITERAL_TYPES entry
    // (effectivePorts.ts) precisely so a freshly-dropped Set node isn't immediately flagged
    // invalid before the user has touched it.
    const definition = get().nodeDefinitions[type];
    if (definition) {
      const literals = defaultLiteralsFor(type, definition);
      if (literals) data.literals = literals;
    }
    const node: Node = { id: generateNodeId(type), type, position, data };
    set({ nodes: [...get().nodes, node], isDirty: true });
    get().runValidation();
  },

  openNodeBrowser: () => set({ isNodeBrowserOpen: true }),
  closeNodeBrowser: () => set({ isNodeBrowserOpen: false }),

  updateNodeConfig: (nodeId, key, value) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n)),
      isDirty: true,
    });
    get().runValidation();
  },

  // Backs GenericNode.tsx's "+ Add pin"/"×" affordances for AND/NAND/OR/NOR/XOR's dynamic
  // boolean inputs and Switch's dynamic case exec-outputs. Thin wrappers around
  // variadicPins.ts's pure helpers, matching updateNodeConfig's isDirty/runValidation pattern.
  addInputPin: (nodeId) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? addVariadicInputPin(n) : n)),
      isDirty: true,
    });
    get().runValidation();
  },

  removeInputPin: (nodeId, pinId) => {
    const { nodes, edges } = removeVariadicInputPin(nodeId, pinId, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  addSwitchCasePin: (nodeId) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? addSwitchCase(n) : n)),
      isDirty: true,
    });
    get().runValidation();
  },

  removeSwitchCasePin: (nodeId, caseId) => {
    const { nodes, edges } = removeSwitchCase(nodeId, caseId, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  addSequencePin: (nodeId) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? addSequencePinHelper(n) : n)),
      isDirty: true,
    });
    get().runValidation();
  },

  removeSequencePin: (nodeId, pinId) => {
    const { nodes, edges } = removeSequencePinHelper(nodeId, pinId, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  addPathExtractorParam: (nodeId) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? addPathExtractorParamHelper(n) : n)),
      isDirty: true,
    });
    get().runValidation();
  },

  removePathExtractorParam: (nodeId) => {
    const { nodes, edges } = removePathExtractorParamHelper(nodeId, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  addCallbackArg: (nodeId) => {
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? addCallbackArgHelper(n) : n)),
      isDirty: true,
    });
    get().runValidation();
  },

  removeCallbackArg: (nodeId, argId) => {
    const { nodes, edges } = removeCallbackArgHelper(nodeId, argId, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  setFunctionUsage: (nodeId, usage) => {
    const { nodes, edges } = setFunctionUsageHelper(nodeId, usage, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  setPromiseAwaited: (nodeId, awaited) => {
    const { nodes, edges } = setPromiseAwaitedHelper(nodeId, awaited, get().nodes, get().edges);
    set({ nodes, edges, isDirty: true });
    get().runValidation();
  },

  updateSwitchCaseValue: (nodeId, caseId, value) => {
    set({ nodes: updateSwitchCaseValueHelper(nodeId, caseId, value, get().nodes), isDirty: true });
    get().runValidation();
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setZoom: (zoom) => set({ currentZoom: zoom }),

  deleteSelectedNode: () => {
    const { selectedNodeId, nodes } = get();
    if (!selectedNodeId) return;
    let updatedNodes = nodes;
    if (nodes.find((n) => n.id === selectedNodeId)?.type === "annotation.commentGroup") {
      updatedNodes = releaseChildrenOfDeletedGroup(nodes, selectedNodeId);
    }
    set({
      nodes: updatedNodes.filter((n) => n.id !== selectedNodeId),
      edges: get().edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
      selectedNodeId: null,
      isDirty: true,
    });
    get().runValidation();
  },

  deleteEdge: (edgeId) => {
    set({
      edges: get().edges.filter((e) => e.id !== edgeId),
      isDirty: true,
    });
    get().runValidation();
  },

  // Phase 31 redirecting wires (reroute anchors). Purely cosmetic routing — like
  // node.position, never read by codegen/validation — stashed in edge.data.waypoints since
  // React Flow's Edge type has no first-class waypoints concept.
  addEdgeWaypoint: (edgeId, index, point) => {
    set({
      edges: get().edges.map((e) => {
        if (e.id !== edgeId) return e;
        const existing = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints ?? [];
        const waypoint: EdgeWaypoint = { id: generateWaypointId(), x: point.x, y: point.y };
        const next = [...existing.slice(0, index), waypoint, ...existing.slice(index)];
        return { ...e, data: { ...e.data, waypoints: next } };
      }),
      isDirty: true,
    });
    get().runValidation();
  },

  // Fires on every pointer-drag frame while an anchor is being dragged — deliberately skips
  // runValidation() (waypoints never affect validation results) unlike the other two.
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
      isDirty: true,
    });
  },

  removeEdgeWaypoint: (edgeId, waypointId) => {
    set({
      edges: get().edges.map((e) => {
        if (e.id !== edgeId) return e;
        const existing = (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints ?? [];
        return { ...e, data: { ...e.data, waypoints: existing.filter((w) => w.id !== waypointId) } };
      }),
      isDirty: true,
    });
    get().runValidation();
  },

  // Phase 10 Variables. `removeVariable` deliberately does NOT cascade-delete or edit any
  // variable.get/variable.set node that references the removed id — a dangling reference
  // is left for runValidation/compile-time validation to flag, the same "codegen refuses
  // to run rather than silently emitting broken code" philosophy used everywhere else in
  // this codebase (see e.g. logic.require's Export-node handling).
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
    set({ variables: [...variables, variable], isDirty: true });
    get().runValidation();
  },

  renameVariable: (id, name) => {
    set({
      variables: get().variables.map((v) => (v.id === id ? { ...v, name } : v)),
      isDirty: true,
    });
    get().runValidation();
  },

  setVariableKeyword: (id, keyword) => {
    set({
      variables: get().variables.map((v) => (v.id === id ? { ...v, keyword } : v)),
      isDirty: true,
    });
    get().runValidation();
  },

  setVariableDataType: (id, dataType) => {
    set({
      variables: get().variables.map((v) => (v.id === id ? { ...v, dataType } : v)),
      isDirty: true,
    });
    get().runValidation();
  },

  setVariableDefault: (id, value) => {
    set({
      variables: get().variables.map((v) => (v.id === id ? { ...v, defaultValue: value } : v)),
      isDirty: true,
    });
    get().runValidation();
  },

  removeVariable: (id) => {
    set({ variables: get().variables.filter((v) => v.id !== id), isDirty: true });
    get().runValidation();
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
    set({ nodes: withParentsBeforeChildren(updatedNodes), isDirty: true });
    get().runValidation();
  },

  // Called at drag-stop to reconcile a just-dragged non-group node with comment-group
  // membership — reparents if now overlapping a group, un-parents if no longer in its group.
  reparentNodeOnDragStop: (nodeId) => {
    const nodes = get().nodes;
    const draggedNode = nodes.find((n) => n.id === nodeId);
    if (!draggedNode || draggedNode.type === "annotation.commentGroup") return;

    const newParentId = findContainingGroup(nodes, nodeId);
    const currentParentId = draggedNode.parentId;

    if (newParentId !== currentParentId) {
      set({
        nodes: reparentNode(nodes, nodeId, newParentId),
        isDirty: true,
      });
      get().runValidation();
    }
  },

  saveFlow: async () => {
    const { currentFilePath } = get();
    if (!currentFilePath) {
      set({ lastError: "No file is open — open a file before saving." });
      return;
    }

    set({ isSaving: true, lastError: null });
    try {
      const { nodes, edges, meta, variables } = get();
      await api.saveBlueprint(currentFilePath, graphToFlow(nodes, edges, meta, variables));
      set({ isSaving: false, isDirty: false });
      get().bumpProjectRevision();
    } catch (err) {
      set({ isSaving: false, lastError: (err as Error).message });
    }
  },

  runValidation: () => {
    if (validationTimer) clearTimeout(validationTimer);
    return new Promise<void>((resolve) => {
      validationTimer = setTimeout(async () => {
        try {
          const { nodes, edges, meta, variables } = get();
          const result = await api.validateFlowRemote(graphToFlow(nodes, edges, meta, variables));
          set({
            validationErrors: result.errors,
            validationErrorsByNodeId: groupErrorsByNodeId(result.errors),
          });
        } catch {
          // Live validation is best-effort; a transient failure shouldn't block editing.
        }
        resolve();
      }, 500);
    });
  },

  bumpProjectRevision: () => set((s) => ({ projectRevision: s.projectRevision + 1 })),

  compileProject: async () => {
    set({ isCompiling: true, lastError: null });
    try {
      const result = await api.compileProject();
      const revision = get().projectRevision;
      set({
        isCompiling: false,
        compiledResults: result.results,
        compileErrors: result.valid ? [] : result.errors,
        compiledAtRevision: revision,
        selectedPreviewFile: result.results[0]?.relativePath ?? null,
        // Stale checkboxes from a previous compile could reference a renamed/removed
        // file — clear on every fresh compile rather than carrying them forward.
        checkedPreviewFiles: new Set(),
        isPreviewOpen: result.valid ? true : get().isPreviewOpen,
        // A failed compile has nothing to preview — surface why in the error
        // log instead of leaving the user with a disabled button and a
        // console-only 422, which is undiscoverable from the UI alone.
        isErrorLogOpen: result.valid ? get().isErrorLogOpen : true,
      });
    } catch (err) {
      set({ isCompiling: false, lastError: (err as Error).message });
    }
  },

  writeProjectToDisk: async () => {
    if (selectIsCompileStale(get())) {
      set({ lastError: "Project files changed since last compile — click Compile again before writing." });
      return false;
    }

    set({ isWritingAll: true, lastError: null });
    try {
      const result = await api.writeProjectToDisk();
      if (!("written" in result) || !result.written) {
        set({ isWritingAll: false, compileErrors: (result as { errors: ProjectFileError[] }).errors });
        return false;
      }
      set({ isWritingAll: false, lastWrittenFiles: result.files });
      return true;
    } catch (err) {
      set({ isWritingAll: false, lastError: (err as Error).message });
      return false;
    }
  },

  writeCheckedFilesToDisk: async () => {
    if (selectIsCompileStale(get())) {
      set({ lastError: "Project files changed since last compile — click Compile again before writing." });
      return false;
    }
    const relativePaths = Array.from(get().checkedPreviewFiles);
    if (relativePaths.length === 0) return false;

    set({ isWritingChecked: true, lastError: null });
    try {
      const result = await api.writeFilesToDisk(relativePaths);
      if (!("written" in result)) {
        set({ isWritingChecked: false, compileErrors: result.errors });
        return false;
      }
      if (result.errors.length > 0) {
        // Partial success (e.g. one checked path no longer exists in the recompiled
        // project) — surface which files actually failed without discarding the ones
        // that succeeded.
        set({
          isWritingChecked: false,
          lastWrittenFiles: result.files,
          lastError: result.errors.map((e) => `${e.relativePath}: ${e.message}`).join("; "),
        });
        return result.written;
      }
      set({ isWritingChecked: false, lastWrittenFiles: result.files });
      return true;
    } catch (err) {
      set({ isWritingChecked: false, lastError: (err as Error).message });
      return false;
    }
  },

  toggleCheckedPreviewFile: (relativePath) =>
    set((s) => {
      const next = new Set(s.checkedPreviewFiles);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return { checkedPreviewFiles: next };
    }),

  setAllCheckedPreviewFiles: (checked) =>
    set((s) => ({
      checkedPreviewFiles: checked ? new Set((s.compiledResults ?? []).map((f) => f.relativePath)) : new Set(),
    })),

  selectPreviewFile: (relativePath) => set({ selectedPreviewFile: relativePath }),

  closePreview: () => set({ isPreviewOpen: false }),

  toggleErrorLog: () => set((s) => ({ isErrorLogOpen: !s.isErrorLogOpen })),
  closeErrorLog: () => set({ isErrorLogOpen: false }),

  openCodeExpand: (nodeId: string, fieldKey: string, fieldLabel: string) => set({ expandedCodeField: { nodeId, fieldKey, fieldLabel } }),
  closeCodeExpand: () => set({ expandedCodeField: null }),

  openCommentExpand: (nodeId: string) => set({ expandedCommentField: { nodeId } }),
  closeCommentExpand: () => set({ expandedCommentField: null }),

  startServer: async () => {
    const { projectSettings, currentFilePath } = get();
    if (selectIsCompileStale(get())) {
      set({ lastError: "Project files changed since last compile — click Compile again before running." });
      return false;
    }

    if (projectSettings?.mode === "script" && !currentFilePath) {
      set({ lastError: "No file selected — open a file in the editor first." });
      return false;
    }

    set({ isStartingServer: true, lastError: null, serverLogs: [] });
    try {
      const targetFile = projectSettings?.mode === "script" ? currentFilePath || undefined : undefined;
      const result = await api.startServer(targetFile);

      if ("running" in result) {
        closeLogStream?.();
        closeLogStream = api.subscribeToServerLogs(
          (line) => {
            set((s) => ({ serverLogs: [...s.serverLogs, line].slice(-MAX_CLIENT_LOG_LINES) }));
          },
          () => {
            set({ isServerRunning: false });
          },
        );
        set({ isStartingServer: false, isServerRunning: true });
        return true;
      }

      if ("errors" in result) {
        set({ isStartingServer: false, compileErrors: result.errors, isErrorLogOpen: true });
        return false;
      }

      set({ isStartingServer: false, lastError: result.error });
      return false;
    } catch (err) {
      set({ isStartingServer: false, lastError: (err as Error).message });
      return false;
    }
  },

  stopServer: async () => {
    set({ isStoppingServer: true, lastError: null });
    try {
      await api.stopServer();
      closeLogStream?.();
      closeLogStream = undefined;
      set({ isStoppingServer: false, isServerRunning: false });
    } catch (err) {
      set({ isStoppingServer: false, lastError: (err as Error).message });
    }
  },

  loadProjectSettings: async () => {
    try {
      const settings = await api.getProjectSettings();
      set({ projectSettings: settings });
    } catch (err) {
      set({ lastError: (err as Error).message });
    }
  },

  saveProjectSettings: async (settings) => {
    try {
      const result = await api.updateProjectSettings(settings);
      if (result.ok) {
        set({ projectSettings: settings, isSettingsOpen: false });
        return [];
      }
      return result.errors;
    } catch (err) {
      const message = (err as Error).message;
      set({ lastError: message });
      return [message];
    }
  },

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  installPlugin: async (bytes) => {
    set({ lastError: null });
    try {
      const result = await api.installPlugin(bytes);
      if (!result.ok) {
        set({ lastError: result.errors.join("\n") });
        return false;
      }
      // The plugin is registered server-side immediately (no restart needed) — refetch
      // the registry so it shows up in NodeBrowserModal/NodePickerMenu right away.
      await refreshNodeRegistry(set);
      return true;
    } catch (err) {
      set({ lastError: (err as Error).message });
      return false;
    }
  },
}));
