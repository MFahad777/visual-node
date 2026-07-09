import { create } from "zustand";
import type { Node } from "@xyflow/react";
import type { FlowEdge, FlowNode, VariableDeclaration } from "@visual-node/core";
import { createFunctionGraphStore, type FunctionGraphStore } from "./functionGraphStore.js";
import { useFlowStore } from "./flowStore.js";

export interface FunctionGraphTab {
  kind: "functionGraph";
  functionNodeId: string;
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

  openFunctionGraphTab: (functionNode: Node) => void;
  closeFunctionGraphTab: (functionNodeId: string) => void;
  navigateTo: (tabId: string) => void;
  goBack: () => void;
  goForward: () => void;
  closeAllFunctionGraphTabs: () => void;
}

/**
 * Reproduces `FunctionGraphModal.tsx`'s old `persistGraphToOuterNode` — writes the tab's
 * live sub-graph state back into the outer Function node's `data.params`/`data.graph`.
 * Called from the tab's store `subscribe` (see `openFunctionGraphTab` below) on every real
 * edit, not from an explicit Save button — this is the "live-sync" persistence model.
 * B2: combine two sequential updateNodeConfig calls into one setState + runValidation,
 * halving global set()/runValidation() invocations per real edit inside a tab.
 */
/** Collapses runs of consecutive identical ids left behind after filtering an id out of history. */
function dedupeConsecutive(ids: string[]): string[] {
  return ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
}

function persistTabToOuterNode(functionNodeId: string, store: FunctionGraphStore): void {
  const state = store.getState();
  const { nodes } = useFlowStore.getState();
  const nodeIndex = nodes.findIndex((n) => n.id === functionNodeId);
  if (nodeIndex < 0) return;

  const outerNode = nodes[nodeIndex];
  const updatedNodes = [...nodes];
  // Handler Function has no `data.params` field — its parameters are the fixed req/res/next
  // triple declared by the node type itself, not user-editable, so writing a `params` key
  // back would just pollute persisted `.blueprint` JSON with a field the node never reads.
  const paramsPatch =
    outerNode.type === "logic.handlerFunction"
      ? {}
      : (() => {
          const entry = state.nodes.find((n) => n.type === "logic.graphEntry");
          const params: string[] = Array.isArray(entry?.data?.params) ? (entry!.data!.params as string[]) : [];
          return { params: params.join(", ") };
        })();

  updatedNodes[nodeIndex] = {
    ...outerNode,
    data: {
      ...outerNode.data,
      ...paramsPatch,
      graph: state.exportGraph(),
    },
  };

  useFlowStore.setState({ nodes: updatedNodes });
  useFlowStore.getState().runValidation();
}

export const useEditorTabsStore = create<EditorTabsState>((set, get) => ({
  functionGraphTabs: [],
  activeTabId: "main",
  history: ["main"],
  historyIndex: 0,

  openFunctionGraphTab: (functionNode) => {
    const existing = get().functionGraphTabs.find((t) => t.functionNodeId === functionNode.id);
    if (existing) {
      get().navigateTo(functionNode.id);
      return;
    }

    // Handler Function's parameters are the fixed req/res/next triple declared by the node
    // type itself (see HANDLER_FUNCTION_PARAMS in packages/core), not a user-editable
    // `data.params` field like logic.function has.
    const paramNames =
      functionNode.type === "logic.handlerFunction"
        ? ["req", "res", "next"]
        : String(functionNode.data?.params ?? "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
    const initialVariables =
      (functionNode.data?.graph as { variables?: VariableDeclaration[] } | undefined)?.variables ?? [];
    const graph =
      (functionNode.data?.graph as { nodes: FlowNode[]; edges: FlowEdge[] } | undefined) ?? { nodes: [], edges: [] };

    const store = createFunctionGraphStore(graph, paramNames, initialVariables);

    // Live-sync: any real content edit (not a selection-only change) writes straight back
    // into the outer flowStore node, mirroring how every other node-config edit on the main
    // canvas already works. Reference-equality guard skips `selectedNodeId`-only changes,
    // same intent as flowStore's documented onNodesChange/onEdgesChange "select"/"dimensions"
    // skip.
    const unsubscribe = store.subscribe((state, prevState) => {
      if (
        state.nodes !== prevState.nodes ||
        state.edges !== prevState.edges ||
        state.variables !== prevState.variables
      ) {
        persistTabToOuterNode(functionNode.id, store);
      }
    });

    const tab: FunctionGraphTab = { kind: "functionGraph", functionNodeId: functionNode.id, store, unsubscribe };
    set({ functionGraphTabs: [...get().functionGraphTabs, tab] });
    get().navigateTo(functionNode.id);
  },

  closeFunctionGraphTab: (functionNodeId) => {
    const tab = get().functionGraphTabs.find((t) => t.functionNodeId === functionNodeId);
    if (!tab) return;
    tab.unsubscribe();

    const remainingTabs = get().functionGraphTabs.filter((t) => t.functionNodeId !== functionNodeId);
    let newHistory = dedupeConsecutive(get().history.filter((id) => id !== functionNodeId));
    if (newHistory.length === 0) newHistory = ["main"];

    const wasActive = get().activeTabId === functionNodeId;
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
