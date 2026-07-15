import { create } from "zustand";
import type { Node } from "@xyflow/react";
import type { FlowEdge, FlowNode, VariableDeclaration } from "@visual-node/core";
import { createFunctionGraphStore, type FunctionGraphStore } from "./functionGraphStore.js";
import { useFlowStore } from "./flowStore.js";

export interface FunctionGraphTab {
  kind: "functionGraph";
  functionNodeId: string;
  /**
   * "main" (the top-level flowStore canvas) or another open tab's `functionNodeId` — whichever
   * canvas this tab's own outer node actually lives on. A Promise node opened from inside
   * another tab's nested graph (recursion — see promise.node.ts) doesn't live in `flowStore` at
   * all, so live-sync needs to know which store to write back into.
   */
  parentTabId: string;
  store: FunctionGraphStore;
  unsubscribe: () => void;
}

interface EditorTabsState {
  /** The Main Graph tab is always present and isn't tracked here — "main" alone represents it. */
  functionGraphTabs: FunctionGraphTab[];
  /** "main" | a functionNodeId naming one of `functionGraphTabs`. */
  activeTabId: string;
  /** Visited tab ids, oldest first — a plain back/forward history stack. */
  history: string[];
  historyIndex: number;

  /** `parentTabId` defaults to "main" — every pre-existing call site (main canvas double-click,
   * NodeConfigPanel's "Open Blueprint Graph") opens a tab whose outer node lives on the main
   * canvas. A nested opener (a Promise node inside another tab's own graph) passes that tab's
   * own `functionNodeId` explicitly. */
  openFunctionGraphTab: (functionNode: Node, parentTabId?: string) => void;
  closeFunctionGraphTab: (functionNodeId: string) => void;
  navigateTo: (tabId: string) => void;
  goBack: () => void;
  goForward: () => void;
  closeAllFunctionGraphTabs: () => void;
}

/** Collapses runs of consecutive identical ids left behind after filtering an id out of history. */
function dedupeConsecutive(ids: string[]): string[] {
  return ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
}

/** The `type` of the FlowNode a tab's own graph lives inside of, looked up from whichever
 * store actually owns it — `useFlowStore` for a tab parented to "main", or the parent tab's
 * own `functionGraphStore` otherwise. Mirrors `persistTabToOwner`'s identical "whichever store
 * owns this tab's outer node" resolution. */
function findOwnerNodeType(functionNodeId: string, parentTabId: string, tabs: FunctionGraphTab[]): string | undefined {
  if (parentTabId === "main") {
    return useFlowStore.getState().nodes.find((n) => n.id === functionNodeId)?.type;
  }
  const parentTab = tabs.find((t) => t.functionNodeId === parentTabId);
  return parentTab?.store.getState().nodes.find((n) => n.id === functionNodeId)?.type;
}

/**
 * How many ancestor tabs, walking up from `parentTabId` to "main", are themselves backed by a
 * `logic.promise` node — i.e. how many enclosing Promise executor scopes a NEW `logic.promise`
 * tab opened with this `parentTabId` should expose "outerResolve"/"outerReject" pins for (see
 * `codegen/exec-chain.ts`'s `mergeEnclosingPromiseParams`, the core-side counterpart). Since
 * `logic.function`/`logic.handlerFunction` are never addable inside a blueprint sub-canvas at
 * all, a `logic.promise` can only ever be nested (directly or transitively) inside another
 * `logic.promise`, so every ancestor tab this walk visits is itself a Promise tab.
 */
function countAncestorPromiseLevels(parentTabId: string, tabs: FunctionGraphTab[]): number {
  let depth = 0;
  let currentTabId = parentTabId;
  while (currentTabId !== "main") {
    const tab = tabs.find((t) => t.functionNodeId === currentTabId);
    if (!tab) break;
    if (findOwnerNodeType(tab.functionNodeId, tab.parentTabId, tabs) === "logic.promise") depth++;
    currentTabId = tab.parentTabId;
  }
  return depth;
}

/**
 * Reproduces `FunctionGraphModal.tsx`'s old `persistGraphToOuterNode` — writes the tab's live
 * sub-graph state back into the outer node's `data.params`/`data.graph`. Called from the tab's
 * store `subscribe` (see `openFunctionGraphTab` below) on every real edit, not from an explicit
 * Save button — this is the "live-sync" persistence model.
 *
 * Generalized (beyond the original one-level-only version) to write into whichever store
 * actually owns `tab`'s outer node: `useFlowStore` when `tab.parentTabId === "main"`, or the
 * parent tab's own `functionGraphStore` otherwise. In the nested case, writing into the
 * parent's `nodes` via `parentTab.store.setState(...)` fires THAT tab's own subscribe callback
 * (every tab wires one up identically), so an edit several levels deep cascades all the way up
 * to `useFlowStore` for free — no manual recursion needed here.
 */
function persistTabToOwner(tab: FunctionGraphTab): void {
  const state = tab.store.getState();
  const graph = state.exportGraph();
  // Handler Function has no `data.params` field (fixed req/res/next); Promise's parameters are
  // the fixed resolve/reject pair — neither should get a `params` key written back.
  function paramsPatchFor(outerNodeType: string | undefined): Record<string, unknown> {
    if (outerNodeType === "logic.handlerFunction" || outerNodeType === "logic.promise") return {};
    const entry = state.nodes.find((n) => n.type === "logic.graphEntry");
    const params: string[] = Array.isArray(entry?.data?.params) ? (entry!.data!.params as string[]) : [];
    return { params: params.join(", ") };
  }

  if (tab.parentTabId === "main") {
    const { nodes } = useFlowStore.getState();
    const nodeIndex = nodes.findIndex((n) => n.id === tab.functionNodeId);
    if (nodeIndex < 0) return;
    const outerNode = nodes[nodeIndex];
    const updatedNodes = [...nodes];
    updatedNodes[nodeIndex] = {
      ...outerNode,
      data: { ...outerNode.data, ...paramsPatchFor(outerNode.type), graph },
    };
    useFlowStore.setState({ nodes: updatedNodes });
    useFlowStore.getState().runValidation();
    return;
  }

  const parentTab = useEditorTabsStore.getState().functionGraphTabs.find((t) => t.functionNodeId === tab.parentTabId);
  if (!parentTab) return; // parent tab was closed — cascade-closed by closeFunctionGraphTab, shouldn't happen
  const parentNodes = parentTab.store.getState().nodes;
  const nodeIndex = parentNodes.findIndex((n) => n.id === tab.functionNodeId);
  if (nodeIndex < 0) return;
  const outerNode = parentNodes[nodeIndex];
  const updatedNodes = [...parentNodes];
  updatedNodes[nodeIndex] = {
    ...outerNode,
    data: { ...outerNode.data, ...paramsPatchFor(outerNode.type), graph },
  };
  parentTab.store.setState({ nodes: updatedNodes });
}

/** Every tab whose ancestor chain (however deep) passes through `functionNodeId` — used to
 * cascade-close a tab's descendants so `persistTabToOwner` never targets an already-closed
 * parent tab. */
function collectDescendantTabIds(functionNodeId: string, tabs: FunctionGraphTab[]): string[] {
  const directChildren = tabs.filter((t) => t.parentTabId === functionNodeId);
  return directChildren.flatMap((child) => [child.functionNodeId, ...collectDescendantTabIds(child.functionNodeId, tabs)]);
}

export const useEditorTabsStore = create<EditorTabsState>((set, get) => ({
  functionGraphTabs: [],
  activeTabId: "main",
  history: ["main"],
  historyIndex: 0,

  openFunctionGraphTab: (functionNode, parentTabId = "main") => {
    const existing = get().functionGraphTabs.find((t) => t.functionNodeId === functionNode.id);
    if (existing) {
      get().navigateTo(functionNode.id);
      return;
    }

    // Handler Function's parameters are the fixed req/res/next triple declared by the node
    // type itself (see HANDLER_FUNCTION_PARAMS in packages/core), not a user-editable
    // `data.params` field like logic.function has. Promise's parameters are the fixed
    // resolve/reject pair declared by the node type, analogous to Handler Function — plus, when
    // this Promise is itself nested inside another Promise's blueprint graph, one "outerResolve"/
    // "outerReject" pin pair per enclosing level (nearest first, numbered "_2"/"_3"/... beyond
    // the first) so a deeply-nested Promise can still settle an ancestor Promise directly,
    // instead of only ever being able to settle its own. See core's `EmitContext
    // .enclosingPromiseExecutorParams` / `logic.graphEntry`'s `resultIdentifier` for the codegen
    // side of this same naming convention.
    const paramNames =
      functionNode.type === "logic.handlerFunction"
        ? ["req", "res", "next"]
        : functionNode.type === "logic.promise"
          ? (() => {
              const depth = countAncestorPromiseLevels(parentTabId, get().functionGraphTabs);
              const outerParams: string[] = [];
              for (let level = 1; level <= depth; level++) {
                const suffix = level === 1 ? "" : `_${level}`;
                outerParams.push(`outerResolve${suffix}`, `outerReject${suffix}`);
              }
              return ["resolve", "reject", ...outerParams];
            })()
          : String(functionNode.data?.params ?? "")
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
    const initialVariables =
      (functionNode.data?.graph as { variables?: VariableDeclaration[] } | undefined)?.variables ?? [];
    const graph =
      (functionNode.data?.graph as { nodes: FlowNode[]; edges: FlowEdge[]; comments?: any } | undefined) ?? { nodes: [], edges: [] };

    const store = createFunctionGraphStore(graph, paramNames, initialVariables);

    // Live-sync: any real content edit (not a selection-only change) writes straight back
    // into whichever store owns this tab's outer node (see persistTabToOwner) — mirroring how
    // every other node-config edit already works. Reference-equality guard skips
    // `selectedNodeId`-only changes, same intent as flowStore's documented
    // onNodesChange/onEdgesChange "select"/"dimensions" skip.
    const tab: FunctionGraphTab = {
      kind: "functionGraph",
      functionNodeId: functionNode.id,
      parentTabId,
      store,
      unsubscribe: store.subscribe((state, prevState) => {
        if (
          state.nodes !== prevState.nodes ||
          state.edges !== prevState.edges ||
          state.variables !== prevState.variables
        ) {
          persistTabToOwner(tab);
        }
      }),
    };
    set({ functionGraphTabs: [...get().functionGraphTabs, tab] });
    get().navigateTo(functionNode.id);
  },

  closeFunctionGraphTab: (functionNodeId) => {
    const tab = get().functionGraphTabs.find((t) => t.functionNodeId === functionNodeId);
    if (!tab) return;

    // Cascade-close every descendant tab first (a tab whose outer node lives inside a graph
    // that's about to disappear can no longer live-sync anywhere) — collect while the full
    // list is still intact, then tear down each one (including `tab` itself) in one pass.
    const idsToClose = [functionNodeId, ...collectDescendantTabIds(functionNodeId, get().functionGraphTabs)];
    const closingTabs = get().functionGraphTabs.filter((t) => idsToClose.includes(t.functionNodeId));
    closingTabs.forEach((t) => t.unsubscribe());

    const remainingTabs = get().functionGraphTabs.filter((t) => !idsToClose.includes(t.functionNodeId));
    let newHistory = dedupeConsecutive(get().history.filter((id) => !idsToClose.includes(id)));
    if (newHistory.length === 0) newHistory = ["main"];

    const wasActive = idsToClose.includes(get().activeTabId);
    const nextActive = wasActive ? newHistory[newHistory.length - 1] : get().activeTabId;
    const nextIndex = newHistory.lastIndexOf(nextActive);

    set({
      functionGraphTabs: remainingTabs,
      history: newHistory,
      historyIndex: nextIndex >= 0 ? nextIndex : newHistory.length - 1,
      activeTabId: nextActive,
    });
  },

  navigateTo: (tabId) => {
    if (tabId === get().activeTabId) return;
    const truncated = get().history.slice(0, get().historyIndex + 1);
    const nextHistory = [...truncated, tabId];
    set({ activeTabId: tabId, history: nextHistory, historyIndex: nextHistory.length - 1 });
  },

  goBack: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({ historyIndex: newIndex, activeTabId: history[newIndex] });
  },

  goForward: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({ historyIndex: newIndex, activeTabId: history[newIndex] });
  },

  // Called from flowStore's `openFile` when switching to a different .blueprint file — open
  // function-graph tabs reference node ids scoped to the previously-loaded flow and can't
  // carry over.
  closeAllFunctionGraphTabs: () => {
    get().functionGraphTabs.forEach((t) => t.unsubscribe());
    set({ functionGraphTabs: [], activeTabId: "main", history: ["main"], historyIndex: 0 });
  },
}));
