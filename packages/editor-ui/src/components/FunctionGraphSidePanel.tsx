import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { NodeDefinition, VariableDeclaration } from "@visual-node/core";
import * as api from "../api/client.js";
import { useFlowStore, generateUniquePromiseName } from "../store/flowStore.js";
import { useEditorTabsStore, type FunctionGraphTab } from "../store/editorTabsStore.js";
import { getCallbackArgs } from "../canvas/effectivePorts.js";
import { SwitchCasesConfig } from "./SwitchCasesConfig.js";
import { VariablesPanel } from "./VariablesPanel.js";
import { LazyCodeEditor } from "./LazyCodeEditor.js";
import { Checkbox } from "./Checkbox.js";

/**
 * A tab's own outer node doesn't necessarily live in `flowStore` — a Promise node opened
 * recursively from inside another tab's nested graph (see promise.node.ts) lives in that
 * parent tab's own `functionGraphStore` instead (see `FunctionGraphTab.parentTabId`). These
 * two helpers resolve "the array of sibling nodes this tab's outer node lives among" /
 * "write a field back into this tab's outer node," dispatching to whichever store actually
 * owns it. Plain functions, not hooks — safe to call from effects/event handlers; `useOwnerNode`
 * below is the reactive (render-time) counterpart for read access.
 */
function getOwnerNodes(tab: FunctionGraphTab): Array<{ type?: string; data?: Record<string, unknown> }> {
  if (tab.parentTabId === "main") return useFlowStore.getState().nodes;
  const parentTab = useEditorTabsStore.getState().functionGraphTabs.find((t) => t.functionNodeId === tab.parentTabId);
  return parentTab?.store.getState().nodes ?? [];
}

function updateOwnerNode(tab: FunctionGraphTab, nodeId: string, key: string, value: unknown): void {
  if (tab.parentTabId === "main") {
    useFlowStore.getState().updateNodeConfig(nodeId, key, value);
    return;
  }
  const parentTab = useEditorTabsStore.getState().functionGraphTabs.find((t) => t.functionNodeId === tab.parentTabId);
  parentTab?.store.getState().updateNodeData(nodeId, key, value);
}

/**
 * Reactive counterpart to `getOwnerNodes`/`updateOwnerNode` — resolves `tab`'s own outer node
 * (the Node the "Function Details" panel below describes), re-rendering when it changes,
 * regardless of whether it lives in `flowStore` ("main"-parented tab) or another tab's own
 * `functionGraphStore` (a recursively-nested tab). `useSyncExternalStore` (rather than a
 * zustand hook call) is required here because WHICH store to subscribe to can itself change
 * between renders of this same component instance (switching from a main-parented tab to a
 * nested one) — conditionally calling one zustand hook vs. another based on a runtime value
 * would violate the Rules of Hooks; subscribing/reading through a single indirection layer
 * does not.
 */
function useOwnerNode(tab: FunctionGraphTab | undefined): Node | undefined {
  const parentTab = useEditorTabsStore((s) =>
    tab && tab.parentTabId !== "main" ? s.functionGraphTabs.find((t) => t.functionNodeId === tab.parentTabId) : undefined,
  );
  const ownerStore = tab ? (tab.parentTabId === "main" ? useFlowStore : parentTab?.store) : undefined;

  const subscribe = useCallback(
    (onStoreChange: () => void) => (ownerStore ? ownerStore.subscribe(onStoreChange) : () => {}),
    [ownerStore],
  );
  const getSnapshot = useCallback(
    () => (tab && ownerStore ? ownerStore.getState().nodes.find((n) => n.id === tab.functionNodeId) : undefined),
    [tab, ownerStore],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Sidebar half of the active function-graph tab (Phase 21) — the `w-72` column
 * `FunctionGraphModal.tsx` used to render inside its own overlay, now rendered by `App.tsx`
 * in the same right-column slot as `NodeConfigPanel`, swapped in only while a function-graph
 * tab (not the Main Graph) is active. Store-driven singleton, same self-gating convention as
 * `NodeConfigPanel`: renders nothing if there's no active function-graph tab.
 */
export function FunctionGraphSidePanel() {
  const activeTabId = useEditorTabsStore((s) => s.activeTabId);
  const tab = useEditorTabsStore((s) => s.functionGraphTabs.find((t) => t.functionNodeId === activeTabId));
  const functionNode = useOwnerNode(tab);

  // Backfills a blank Name for a Promise node opened here that predates the auto-seeded name
  // (created before this feature existed, or via any path that bypassed the seeding logic) —
  // self-heals on open instead of leaving it stuck empty forever. Owner-aware: writes back
  // into whichever store actually holds this tab's outer node.
  useEffect(() => {
    if (!tab || !functionNode) return;
    if (functionNode.type !== "logic.promise") return;
    if (String(functionNode.data?.name ?? "").trim()) return;
    updateOwnerNode(tab, functionNode.id, "name", generateUniquePromiseName(getOwnerNodes(tab)));
  }, [tab, functionNode]);

  if (!tab || !functionNode) return null;

  return (
    <FunctionGraphSidePanelContent
      key={tab.functionNodeId}
      tab={tab}
      functionNode={functionNode}
      updateNodeConfig={(nodeId, key, value) => updateOwnerNode(tab, nodeId, key, value)}
    />
  );
}

function FunctionGraphSidePanelContent({
  tab,
  functionNode,
  updateNodeConfig,
}: {
  tab: FunctionGraphTab;
  functionNode: Node;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
}) {
  const useGraphStore = tab.store;
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const deleteSelectedNode = useGraphStore((s) => s.deleteSelectedNode);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const setPromiseAwaited = useGraphStore((s) => s.setPromiseAwaited);
  const addSwitchCasePin = useGraphStore((s) => s.addSwitchCasePin);
  const removeSwitchCasePin = useGraphStore((s) => s.removeSwitchCasePin);
  const updateSwitchCaseValue = useGraphStore((s) => s.updateSwitchCaseValue);
  const addParam = useGraphStore((s) => s.addParam);
  const removeParam = useGraphStore((s) => s.removeParam);
  const renameParam = useGraphStore((s) => s.renameParam);
  const variables = useGraphStore((s) => s.variables);
  const addVariable = useGraphStore((s) => s.addVariable);
  const renameVariable = useGraphStore((s) => s.renameVariable);
  const setVariableKeyword = useGraphStore((s) => s.setVariableKeyword);
  const setVariableDataType = useGraphStore((s) => s.setVariableDataType);
  const setVariableDefault = useGraphStore((s) => s.setVariableDefault);
  const removeVariable = useGraphStore((s) => s.removeVariable);
  // Phase 25: the outer/main-canvas module-level variable list + its actions, read straight off
  // the global flowStore singleton — edits here write directly into flowStore, so they're
  // visible immediately on the main canvas and every other open tab, same as the local
  // variables above are visible across this one tab's own state.
  const moduleVariables = useFlowStore((s) => s.variables);
  const addModuleVariable = useFlowStore((s) => s.addVariable);
  const renameModuleVariable = useFlowStore((s) => s.renameVariable);
  const setModuleVariableKeyword = useFlowStore((s) => s.setVariableKeyword);
  const setModuleVariableDataType = useFlowStore((s) => s.setVariableDataType);
  const setModuleVariableDefault = useFlowStore((s) => s.setVariableDefault);
  const removeModuleVariable = useFlowStore((s) => s.removeVariable);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // Live parameter list, read from the graph's single Inputs entry node — this is what the
  // Details panel below displays and edits.
  const entryNode = nodes.find((n) => n.type === "logic.graphEntry");
  const paramNames: string[] = Array.isArray(entryNode?.data?.params) ? (entryNode!.data!.params as string[]) : [];

  const [functionGraphDefinitions, setFunctionGraphDefinitions] = useState<Record<string, NodeDefinition> | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    // B1: use the shared cached fetchNodeRegistry to dedupe concurrent tab opens/switches.
    api.fetchNodeRegistryCached("function-graph").then((result) => {
      if (!cancelled) setFunctionGraphDefinitions(Object.fromEntries(result.definitions.map((d) => [d.type, d])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handler Function's req/res/next parameters are fixed by the node type — Express's
  // handler signature is invariant — so the Inputs list renders read-only here instead of
  // the normal add/rename/remove controls `logic.function` gets. Promise's resolve/reject
  // parameters are similarly fixed by the node type.
  const isFixedParams = functionNode.type === "logic.handlerFunction" || functionNode.type === "logic.promise";

  return (
    <div className="w-72 shrink-0 overflow-auto border-l border-black/60 bg-[#1f1f1f] p-3">
      <FunctionDetailsPanel
        functionName={String(functionNode.data?.name ?? "")}
        onRenameFunction={(name) => updateNodeConfig(functionNode.id, "name", name)}
        paramNames={paramNames}
        isFixedParams={isFixedParams}
        onAddParam={addParam}
        onRemoveParam={removeParam}
        onRenameParam={renameParam}
        variables={variables}
        onAddVariable={addVariable}
        onRenameVariable={renameVariable}
        onSetVariableKeyword={setVariableKeyword}
        onSetVariableDataType={setVariableDataType}
        onSetVariableDefault={setVariableDefault}
        onRemoveVariable={removeVariable}
        moduleVariables={moduleVariables}
        onAddModuleVariable={addModuleVariable}
        onRenameModuleVariable={renameModuleVariable}
        onSetModuleVariableKeyword={setModuleVariableKeyword}
        onSetModuleVariableDataType={setModuleVariableDataType}
        onSetModuleVariableDefault={setModuleVariableDefault}
        onRemoveModuleVariable={removeModuleVariable}
      />

      <div className="my-3 border-t border-black/60" />

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Node Config</h3>
        {selectedNode && selectedNode.type !== "logic.graphEntry" && (
          <button
            onClick={deleteSelectedNode}
            className="rounded px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/10"
          >
            Delete
          </button>
        )}
      </div>
      {selectedNode ? (
        <SubCanvasNodeConfig
          node={selectedNode}
          definition={functionGraphDefinitions?.[selectedNode.type ?? ""] ?? null}
          edges={edges as Edge[]}
          updateNodeData={updateNodeData}
          setPromiseAwaited={setPromiseAwaited}
          addSwitchCasePin={addSwitchCasePin}
          removeSwitchCasePin={removeSwitchCasePin}
          updateSwitchCaseValue={updateSwitchCaseValue}
          variables={variables}
          moduleVariables={moduleVariables}
          localNodes={nodes}
          parentTabId={tab.functionNodeId}
        />
      ) : (
        <p className="text-xs text-neutral-400">Select a node to configure it.</p>
      )}
    </div>
  );
}

/**
 * Compact config panel for a selected node inside the blueprint sub-canvas. `NodeConfigPanel`
 * (the main app's equivalent) is bound to the global flowStore and can't reach nodes living in
 * a local `functionGraphStore` instance, so this is a small, purpose-built sibling: generic
 * text/code field rendering driven by whatever `configSchema` the `?scope=function-graph`
 * definitions declare (covers `debug.consoleLog`, `handler.sendJson` alike), and a minimal
 * read-only-plus-resultVariable view for `logic.functionCall` (mirroring
 * `FunctionCallConfig`'s precedent in `NodeConfigPanel.tsx`). `logic.graphEntry`/
 * `logic.graphReturn` have empty `configSchema`s and need no fields at all.
 */
function SubCanvasNodeConfig({
  node,
  definition,
  edges,
  updateNodeData,
  setPromiseAwaited,
  addSwitchCasePin,
  removeSwitchCasePin,
  updateSwitchCaseValue,
  variables,
  moduleVariables,
  localNodes,
  parentTabId,
}: {
  node: Node;
  definition: NodeDefinition | null;
  edges: Edge[];
  updateNodeData: (nodeId: string, key: string, value: unknown) => void;
  setPromiseAwaited: (nodeId: string, awaited: boolean) => void;
  addSwitchCasePin: (nodeId: string) => void;
  removeSwitchCasePin: (nodeId: string, caseId: string) => void;
  updateSwitchCaseValue: (nodeId: string, caseId: string, value: string | number | boolean) => void;
  variables: VariableDeclaration[];
  moduleVariables: VariableDeclaration[];
  /** This tab's own current node list — used to seed a unique Promise name and to detect an
   * existing Blueprint-mode graph's node/edge count, same as `PromiseNodeConfig` on the main
   * canvas. */
  localNodes: Node[];
  /** This tab's own `functionNodeId` — passed as the `parentTabId` to `openFunctionGraphTab`
   * when opening a nested Promise node's own Blueprint graph, so live-sync writes back into
   * THIS tab's store rather than assuming the main canvas. */
  parentTabId: string;
}) {
  // Phase 33: comment-group boxes are a UI-only React Flow node type with no NodeDefinition
  // (no ports, no emit()) — special-case before the "Loading…" fallback below, which would
  // otherwise show forever for this type since `definition` can never resolve for it.
  if (node.type === "annotation.commentGroup") {
    return (
      <p className="text-xs text-neutral-400">
        Comment box — edit its title and color directly on the canvas.
      </p>
    );
  }

  if (!definition) return <p className="text-xs text-neutral-400">Loading…</p>;

  if (node.type === "logic.promise") {
    return (
      <NestedPromiseNodeConfig
        node={node}
        updateNodeData={updateNodeData}
        setPromiseAwaited={setPromiseAwaited}
        localNodes={localNodes}
        parentTabId={parentTabId}
      />
    );
  }

  if (node.type === "variable.get" || node.type === "variable.set") {
    // Phase 25: a Get/Set node in here can be bound to either this graph's own local variable
    // or an outer module-level one (Phase 24 already resolves either at the codegen layer) —
    // check local first, matching the local-wins-on-id-collision precedence used elsewhere.
    const variable =
      variables.find((v) => v.id === node.data?.variableId) ??
      moduleVariables.find((v) => v.id === node.data?.variableId);
    if (!variable) {
      return (
        <div className="rounded border border-red-500/60 bg-red-900/20 px-2 py-1.5 text-xs text-red-400">
          References a variable that no longer exists.
        </div>
      );
    }
    return (
      <div className="rounded border border-neutral-700 bg-black/30 px-2 py-1.5 text-xs text-neutral-300">
        Bound to variable &quot;{variable.name}&quot; ({variable.keyword}) — edit it in the Variables or Module
        Variables panel above.
      </div>
    );
  }

  if (node.type === "controlFlow.switch") {
    return (
      <SwitchCasesConfig
        node={node}
        onAddCase={addSwitchCasePin}
        onRemoveCase={removeSwitchCasePin}
        onUpdateCaseValue={updateSwitchCaseValue}
      />
    );
  }

  if (node.type === "logic.callback") {
    const args = getCallbackArgs(node.data as Record<string, unknown> | undefined);
    const literals = (node.data?.literals as Record<string, unknown> | undefined) ?? {};
    if (args.length === 0) {
      return <p className="text-xs text-neutral-400">No arguments yet — use "+ Add Arg" on the node to add one.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {args.map((arg, i) => {
          const pinId = `arg-${arg.id}`;
          const isWired = edges.some((e) => e.target === node.id && e.targetHandle === pinId);
          return (
            <label key={arg.id} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-400">Arg {i + 1}</span>
              {isWired ? (
                <>
                  <span className="text-[11px] text-neutral-400">Wired — the connected node's value is used instead.</span>
                  <input
                    type="text"
                    disabled
                    value="Wired"
                    className="w-full cursor-not-allowed rounded border border-neutral-800 bg-black/30 px-2 py-1 text-xs text-neutral-400"
                  />
                </>
              ) : (
                <>
                  <span className="text-[11px] text-neutral-400">Any JS literal: a number, a quoted string, or true/false.</span>
                  <input
                    type="text"
                    value={String(literals[pinId] ?? "")}
                    onChange={(e) => updateNodeData(node.id, "literals", { ...literals, [pinId]: e.target.value })}
                    className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
                  />
                </>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  if (node.type === "logic.pathExtractor") {
    const isPathWired = edges.some((e) => e.target === node.id && e.targetHandle === "path");
    const pathField = definition.configSchema.find((f) => f.key === "path");
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-400">Path</span>
          <span className="text-[11px] text-neutral-400">
            {isPathWired
              ? "The Path pin is wired — its value is resolved instead of this field."
              : "Dot or bracket notation: e.g. a.b, items[0].name, billing.calculateTotal."}
          </span>
          {isPathWired ? (
            <input
              type="text"
              disabled
              value="Wired"
              className="w-full cursor-not-allowed rounded border border-neutral-800 bg-black/30 px-2 py-1 text-xs text-neutral-400"
            />
          ) : (
            pathField && (
              <input
                type="text"
                className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
                value={String(node.data?.path ?? "")}
                onChange={(e) => updateNodeData(node.id, "path", e.target.value)}
              />
            )
          )}
        </label>
      </div>
    );
  }

  if (node.type === "logic.functionCall") {
    const variableName = String(node.data?.variableName ?? "");
    const functionName = String(node.data?.functionName ?? "");
    const paramsRaw = String(node.data?.params ?? "");
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded bg-black/40 px-2 py-1.5 font-mono text-xs text-neutral-200">
          {variableName}.{functionName}({paramsRaw})
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-400">Result Variable Name</span>
          <input
            type="text"
            className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
            value={String(node.data?.resultVariable ?? "")}
            onChange={(e) => updateNodeData(node.id, "resultVariable", e.target.value)}
          />
        </label>
      </div>
    );
  }

  if (definition.configSchema.length === 0) {
    return <p className="text-xs text-neutral-400">This node has no configuration.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {definition.configSchema.map((field) => (
        <label key={`${node.id}:${field.key}`} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-400">{field.label}</span>
          {field.hint && <span className="text-[11px] text-neutral-400">{field.hint}</span>}
          {field.type === "code" ? (
            <LazyCodeEditor
              key={`${node.id}:${field.key}`}
              value={node.data?.[field.key] ?? ""}
              field={field}
              onChange={(next) => updateNodeData(node.id, field.key, next)}
              height="100px"
            />
          ) : field.type === "boolean" ? (
            <Checkbox
              checked={Boolean(node.data?.[field.key] ?? field.default ?? false)}
              onChange={(e) => updateNodeData(node.id, field.key, e.target.checked)}
            />
          ) : (
            <input
              type="text"
              className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
              value={String(node.data?.[field.key] ?? "")}
              onChange={(e) => updateNodeData(node.id, field.key, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/**
 * A `logic.promise` node selected inside a nested Blueprint sub-canvas (Function/Handler
 * Function graph, or recursively another Promise's own graph) — full parity with the main
 * canvas's `PromiseNodeConfig` (NodeConfigPanel.tsx): Name, Code/Blueprint Authoring Mode
 * toggle, Executor Body, npm Dependencies, Await, and Wrap In IIFE, plus an "Open Blueprint
 * Graph" button that recursively opens THIS node's own tab with `parentTabId` set to the
 * current tab (not "main") so live-sync writes back here, not into flowStore. Unlike the
 * main-canvas version, this one also owns the Name field itself — the main canvas's Name
 * field lives in `FunctionDetailsPanel` because that panel describes the outer tab's own
 * node, but a nested Promise here is just an ordinary node on this tab's own canvas.
 */
function NestedPromiseNodeConfig({
  node,
  updateNodeData,
  setPromiseAwaited,
  localNodes,
  parentTabId,
}: {
  node: Node;
  updateNodeData: (nodeId: string, key: string, value: unknown) => void;
  setPromiseAwaited: (nodeId: string, awaited: boolean) => void;
  localNodes: Node[];
  parentTabId: string;
}) {
  const openFunctionGraphTab = useEditorTabsStore((s) => s.openFunctionGraphTab);
  const mode = node.data?.mode === "blueprint" ? "blueprint" : "code";
  const awaited = node.data?.awaited === true;
  const graph = node.data?.graph as { nodes?: unknown[]; edges?: unknown[] } | undefined;
  const graphNodeCount = graph?.nodes?.length ?? 0;
  const graphEdgeCount = graph?.edges?.length ?? 0;

  function switchMode(next: "code" | "blueprint") {
    if (next === mode) return;
    if (next === "blueprint") {
      const hasBody = String(node.data?.body ?? "").trim().length > 0;
      const hasGraph = graphNodeCount > 0;
      if (hasBody && !hasGraph) {
        const confirmed = window.confirm(
          "Switching to Blueprint mode won't preserve your existing Executor Body code. Continue?",
        );
        if (!confirmed) return;
      }
      updateNodeData(node.id, "mode", "blueprint");
      return;
    }
    updateNodeData(node.id, "mode", "code");
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Name</span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.name ?? "")}
          onChange={(e) => {
            const trimmed = e.target.value.trim();
            updateNodeData(node.id, "name", trimmed || generateUniquePromiseName(localNodes));
          }}
        />
      </label>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={awaited}
          onChange={(e) => setPromiseAwaited(node.id, e.target.checked)}
        />
        <span className="text-xs font-medium text-neutral-400">Await Promise</span>
      </label>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={node.data?.wrapInIife !== false}
          onChange={(e) => updateNodeData(node.id, "wrapInIife", e.target.checked)}
        />
        <span className="text-xs font-medium text-neutral-400">Wrap In IIFE</span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Authoring Mode</span>
        <div className="flex overflow-hidden rounded border border-neutral-700">
          <button
            type="button"
            onClick={() => switchMode("code")}
            className={`flex-1 px-2 py-1 text-xs ${mode === "code" ? "bg-sky-600 text-white" : "bg-[#1f1f1f] text-neutral-300 hover:bg-neutral-700"}`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => switchMode("blueprint")}
            className={`flex-1 px-2 py-1 text-xs ${mode === "blueprint" ? "bg-sky-600 text-white" : "bg-[#1f1f1f] text-neutral-300 hover:bg-neutral-700"}`}
          >
            Blueprint
          </button>
        </div>
      </div>

      {mode === "code" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Executor Body</span>
            <span className="text-[11px] text-neutral-400">
              Available: resolve, reject functions. Use resolve(value) or reject(error) to settle the Promise.
            </span>
            <LazyCodeEditor
              value={node.data?.body}
              field={{ key: "body", label: "Executor Body", type: "code", default: "" }}
              onChange={(value) => updateNodeData(node.id, "body", value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">npm Dependencies</span>
            <span className="text-[11px] text-neutral-400">
              Comma-separated package names this executor's code depends on, e.g. "lodash, dayjs".
            </span>
            <input
              type="text"
              className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
              value={String(node.data?.npmDependencies ?? "")}
              onChange={(e) => updateNodeData(node.id, "npmDependencies", e.target.value)}
            />
          </label>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="rounded bg-black/40 px-2 py-1.5 text-[11px] text-neutral-300">
            {graphNodeCount} node{graphNodeCount === 1 ? "" : "s"}, {graphEdgeCount} edge{graphEdgeCount === 1 ? "" : "s"}
          </div>
          <button
            type="button"
            onClick={() => openFunctionGraphTab(node, parentTabId)}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            Open Blueprint Graph
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The graph-level counterpart to `SubCanvasNodeConfig` — always visible (not gated on node
 * selection), since Function Name/Inputs describe the whole graph, not one node.
 * Inputs edits go through `functionGraphStore.ts`'s `addParam`/`removeParam`/`renameParam`,
 * which keep the single `logic.graphEntry` node's pins and any wired edges in sync live — no
 * need to switch tabs and back to see the new pin appear. (Return, like Branch/Switch, is an
 * ordinary canvas node added via the picker, not managed through this panel.)
 */
function FunctionDetailsPanel({
  functionName,
  onRenameFunction,
  paramNames,
  isFixedParams = false,
  onAddParam,
  onRemoveParam,
  onRenameParam,
  variables,
  onAddVariable,
  onRenameVariable,
  onSetVariableKeyword,
  onSetVariableDataType,
  onSetVariableDefault,
  onRemoveVariable,
  moduleVariables,
  onAddModuleVariable,
  onRenameModuleVariable,
  onSetModuleVariableKeyword,
  onSetModuleVariableDataType,
  onSetModuleVariableDefault,
  onRemoveModuleVariable,
}: {
  functionName: string;
  onRenameFunction: (name: string) => void;
  paramNames: string[];
  /** True for a Handler Function's fixed req/res/next — renders Inputs read-only, no add/rename/remove. */
  isFixedParams?: boolean;
  onAddParam: (name: string) => void;
  onRemoveParam: (name: string) => void;
  onRenameParam: (oldName: string, newName: string) => void;
  variables: VariableDeclaration[];
  onAddVariable: () => void;
  onRenameVariable: (id: string, name: string) => void;
  onSetVariableKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  onSetVariableDataType: (id: string, dataType: VariableDeclaration["dataType"]) => void;
  onSetVariableDefault: (id: string, value: string) => void;
  onRemoveVariable: (id: string) => void;
  /** Phase 25: the outer/main-canvas module-level variable list, editable from here too — writes go straight into flowStore. */
  moduleVariables: VariableDeclaration[];
  onAddModuleVariable: () => void;
  onRenameModuleVariable: (id: string, name: string) => void;
  onSetModuleVariableKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  onSetModuleVariableDataType: (id: string, dataType: VariableDeclaration["dataType"]) => void;
  onSetModuleVariableDefault: (id: string, value: string) => void;
  onRemoveModuleVariable: (id: string) => void;
}) {
  function handleAddParam() {
    let name = "param";
    let i = 1;
    while (paramNames.includes(name)) {
      i += 1;
      name = `param${i}`;
    }
    onAddParam(name);
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Function</h3>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Name</span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1 text-xs text-neutral-100"
          value={functionName}
          onChange={(e) => onRenameFunction(e.target.value)}
        />
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">Inputs</span>
          {!isFixedParams && (
            <button
              onClick={handleAddParam}
              title="Add input"
              className="flex h-5 w-5 items-center justify-center rounded border border-neutral-600 text-xs text-neutral-300 hover:border-sky-500 hover:text-sky-400"
            >
              +
            </button>
          )}
        </div>
        {isFixedParams ? (
          <div className="flex flex-col gap-1">
            <p className="mb-1 text-[11px] text-neutral-400">Fixed by Express's handler signature.</p>
            {paramNames.map((name, index) => (
              <div
                key={index}
                className="rounded border border-neutral-800 bg-black/30 px-2 py-1 font-mono text-xs text-neutral-300"
              >
                {name}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {paramNames.length === 0 && <p className="text-[11px] text-neutral-400">No inputs.</p>}
            {paramNames.map((name, index) => (
              // Keyed by index, not name: renaming changes `name` every keystroke, and a
              // name-based key would remount the input on every character typed, kicking
              // focus out mid-edit.
              <div key={index} className="flex items-center gap-1">
                <input
                  type="text"
                  className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1 text-xs text-neutral-100"
                  value={name}
                  onChange={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== name) onRenameParam(name, next);
                  }}
                />
                <button
                  onClick={() => onRemoveParam(name)}
                  title="Remove input"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-600 text-xs text-red-400 hover:border-red-500 hover:bg-red-500/10"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <VariablesPanel
        variables={variables}
        onAdd={onAddVariable}
        onRename={onRenameVariable}
        onSetKeyword={onSetVariableKeyword}
        onSetDataType={onSetVariableDataType}
        onSetDefault={onSetVariableDefault}
        onRemove={onRemoveVariable}
      />

      {/* Phase 25: module-level variables declared on the Main Graph — same Get/Set
          drag-and-drop and full add/rename/remove editing as the local Variables panel
          above, writing straight into the outer flowStore so edits here are visible
          immediately on the main canvas and every other open tab. */}
      <VariablesPanel
        title="Module Variables"
        variables={moduleVariables}
        onAdd={onAddModuleVariable}
        onRename={onRenameModuleVariable}
        onSetKeyword={onSetModuleVariableKeyword}
        onSetDataType={onSetModuleVariableDataType}
        onSetDefault={onSetModuleVariableDefault}
        onRemove={onRemoveModuleVariable}
        dragScope="module"
      />
    </div>
  );
}
