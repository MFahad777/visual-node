import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FlowEdge, FlowNode, NodeDefinition, VariableDeclaration } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { createFunctionGraphStore, type FunctionGraphStore } from "../store/functionGraphStore.js";
import { nodeTypes } from "../canvas/nodeTypes.js";
import { CustomEdge } from "../canvas/CustomEdge.js";
import { CategoryLegend } from "../canvas/CategoryLegend.js";
import { FunctionGraphNodeDefinitionsContext, useFunctionGraphNodeDefinitions } from "../canvas/functionGraphNodeDefinitions.js";
import { defaultLiteralsFor } from "../canvas/effectivePorts.js";
import { FunctionGraphEdgeContext } from "../canvas/functionGraphEdgeContext.js";
import { VariableDropMenu } from "../canvas/VariableDropMenu.js";
import { FunctionGraphNodePicker } from "./FunctionGraphNodePicker.js";
import { SwitchCasesConfig } from "./SwitchCasesConfig.js";
import { VariablesPanel } from "./VariablesPanel.js";
import { CODE_MIRROR_BASIC_SETUP, CODE_MIRROR_THEME, extensionsForField } from "./codeEditorShared.js";
import CodeMirror from "@uiw/react-codemirror";
import * as api from "../api/client.js";

const edgeTypes = { "flow-edge": CustomEdge };

interface PickerState {
  screenX: number;
  screenY: number;
  flowPosition: XYPosition;
}

interface VariableDropState {
  screenX: number;
  screenY: number;
  flowPosition: XYPosition;
  variableId: string;
}

/**
 * Store-driven singleton mounted unconditionally in App.tsx (same pattern as
 * CodePreviewModal / CodeExpandModal) — self-gates via an early `return null` when no
 * `logic.function` node is open in blueprint mode.
 */
export function FunctionGraphModal() {
  const openFunctionGraphNodeId = useFlowStore((s) => s.openFunctionGraphNodeId);
  const functionNode = useFlowStore((s) => s.nodes.find((n) => n.id === s.openFunctionGraphNodeId));
  const closeFunctionGraph = useFlowStore((s) => s.closeFunctionGraph);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);

  if (!openFunctionGraphNodeId || !functionNode) return null;

  return (
    <FunctionGraphModalContent
      key={functionNode.id}
      functionNode={functionNode}
      closeFunctionGraph={closeFunctionGraph}
      updateNodeConfig={updateNodeConfig}
    />
  );
}

/**
 * Split out from `FunctionGraphModal` so the local `functionGraphStore` (created via
 * `useMemo` with an empty dep array) is only ever created once per open — the outer
 * `key={functionNode.id}` already guarantees a fresh mount whenever a *different*
 * function node is opened, same rationale as `CodeExpandModal`'s content split.
 */
function FunctionGraphModalContent({
  functionNode,
  closeFunctionGraph,
  updateNodeConfig,
}: {
  functionNode: Node;
  closeFunctionGraph: () => void;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
}) {
  const initialParamNames = useMemo(
    () =>
      String(functionNode.data?.params ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialVariables = useMemo(
    () =>
      (functionNode.data?.graph as { variables?: VariableDeclaration[] } | undefined)?.variables ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const useGraphStore: FunctionGraphStore = useMemo(
    () =>
      createFunctionGraphStore(
        (functionNode.data?.graph as { nodes: FlowNode[]; edges: FlowEdge[] } | undefined) ?? { nodes: [], edges: [] },
        initialParamNames,
        initialVariables,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const deleteSelectedNode = useGraphStore((s) => s.deleteSelectedNode);
  const deleteEdge = useGraphStore((s) => s.deleteEdge);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const addInputPin = useGraphStore((s) => s.addInputPin);
  const removeInputPin = useGraphStore((s) => s.removeInputPin);
  const addSwitchCasePin = useGraphStore((s) => s.addSwitchCasePin);
  const removeSwitchCasePin = useGraphStore((s) => s.removeSwitchCasePin);
  const updateSwitchCaseValue = useGraphStore((s) => s.updateSwitchCaseValue);
  const addParam = useGraphStore((s) => s.addParam);
  const removeParam = useGraphStore((s) => s.removeParam);
  const renameParam = useGraphStore((s) => s.renameParam);
  const addReturn = useGraphStore((s) => s.addReturn);
  const removeReturn = useGraphStore((s) => s.removeReturn);
  const variables = useGraphStore((s) => s.variables);
  const addVariable = useGraphStore((s) => s.addVariable);
  const renameVariable = useGraphStore((s) => s.renameVariable);
  const setVariableKeyword = useGraphStore((s) => s.setVariableKeyword);
  const setVariableDataType = useGraphStore((s) => s.setVariableDataType);
  const setVariableDefault = useGraphStore((s) => s.setVariableDefault);
  const removeVariable = useGraphStore((s) => s.removeVariable);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // Live parameter list, read from the graph's single Inputs entry node — NOT
  // `initialParamNames`, which only ever reflects the outer node's params at modal-open
  // time. This is what the Details panel below displays and edits.
  const entryNode = nodes.find((n) => n.type === "logic.graphEntry");
  const paramNames: string[] = Array.isArray(entryNode?.data?.params) ? (entryNode!.data!.params as string[]) : [];
  const hasReturnNode = nodes.some((n) => n.type === "logic.graphReturn");

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [variableDrop, setVariableDrop] = useState<VariableDropState | null>(null);

  // GenericNode (shared with the main canvas) can't resolve graphEntry/graphReturn
  // from the global flowStore — those types are deliberately excluded from it. Fetch the
  // scoped definitions once per modal-open and provide them via context so this sub-canvas's
  // nodes render correctly instead of falling into GenericNode's "Unknown node type" branch.
  const [functionGraphDefinitions, setFunctionGraphDefinitions] = useState<Record<string, NodeDefinition> | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    api.fetchNodeRegistry("function-graph").then((defs) => {
      if (!cancelled) setFunctionGraphDefinitions(Object.fromEntries(defs.map((d) => [d.type, d])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = () => {
    const finalState = useGraphStore.getState();
    const finalEntry = finalState.nodes.find((n) => n.type === "logic.graphEntry");
    const finalParams: string[] = Array.isArray(finalEntry?.data?.params) ? (finalEntry!.data!.params as string[]) : [];
    updateNodeConfig(functionNode.id, "params", finalParams.join(", "));
    updateNodeConfig(functionNode.id, "graph", finalState.exportGraph());
    closeFunctionGraph();
  };

  const title = `Blueprint Graph — ${functionNode.data?.name ?? "function"}(${functionNode.data?.params ?? ""})`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[85vh] w-[95vw] flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <button onClick={closeFunctionGraph} className="text-neutral-500 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1">
            <FunctionGraphNodeDefinitionsContext.Provider value={functionGraphDefinitions}>
              <FunctionGraphEdgeContext.Provider
                value={{
                  edges,
                  nodes,
                  deleteEdge,
                  updateNodeData,
                  addInputPin,
                  removeInputPin,
                  addSwitchCasePin,
                  removeSwitchCasePin,
                  updateSwitchCaseValue,
                  variables,
                }}
              >
                <ReactFlowProvider>
                  <GraphCanvas
                    nodes={nodes}
                    edges={edges as Edge[]}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    picker={picker}
                    setPicker={setPicker}
                    variableDrop={variableDrop}
                    setVariableDrop={setVariableDrop}
                    variables={variables}
                    localNodes={nodes}
                    onAddNode={(type, position, data) => useGraphStore.getState().addNode(type, position, data)}
                    onSelectNode={selectNode}
                  />
                </ReactFlowProvider>
              </FunctionGraphEdgeContext.Provider>
            </FunctionGraphNodeDefinitionsContext.Provider>
          </div>

          <div className="w-72 shrink-0 overflow-auto border-l border-black/60 bg-[#1f1f1f] p-3">
            <FunctionDetailsPanel
              functionName={String(functionNode.data?.name ?? "")}
              onRenameFunction={(name) => updateNodeConfig(functionNode.id, "name", name)}
              paramNames={paramNames}
              onAddParam={addParam}
              onRemoveParam={removeParam}
              onRenameParam={renameParam}
              hasReturnNode={hasReturnNode}
              onAddReturn={addReturn}
              onRemoveReturn={removeReturn}
              variables={variables}
              onAddVariable={addVariable}
              onRenameVariable={renameVariable}
              onSetVariableKeyword={setVariableKeyword}
              onSetVariableDataType={setVariableDataType}
              onSetVariableDefault={setVariableDefault}
              onRemoveVariable={removeVariable}
            />

            <div className="my-3 border-t border-black/60" />

            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Node Config</h3>
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
                updateNodeData={updateNodeData}
                addSwitchCasePin={addSwitchCasePin}
                removeSwitchCasePin={removeSwitchCasePin}
                updateSwitchCaseValue={updateSwitchCaseValue}
                variables={variables}
              />
            ) : (
              <p className="text-xs text-neutral-500">Select a node to configure it.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/60 px-4 py-3">
          <button
            onClick={closeFunctionGraph}
            className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Split out so `useReactFlow()` (which requires a `ReactFlowProvider` ancestor) can be
 * called for the context-menu position math, mirroring `FlowCanvas.tsx`.
 */
function GraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  picker,
  setPicker,
  variableDrop,
  setVariableDrop,
  variables,
  localNodes,
  onAddNode,
  onSelectNode,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  picker: PickerState | null;
  setPicker: (p: PickerState | null) => void;
  variableDrop: VariableDropState | null;
  setVariableDrop: (v: VariableDropState | null) => void;
  variables: VariableDeclaration[];
  localNodes: Array<{ type?: string; data?: Record<string, unknown> }>;
  onAddNode: (type: string, position: XYPosition, data: Record<string, unknown>) => void;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const scopedDefinitions = useFunctionGraphNodeDefinitions();

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const { clientX, clientY } = event as MouseEvent;
      setPicker({
        screenX: clientX,
        screenY: clientY,
        flowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
      });
    },
    [screenToFlowPosition, setPicker],
  );

  // Variables (Phase 10): the only drop payload this sub-canvas understands today — dragged
  // in from VariablesPanel's rows in the Function Details panel. Same drop-to-choose UX as
  // FlowCanvas.tsx's onDrop: open VariableDropMenu instead of placing a node immediately.
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const variablePayload = event.dataTransfer.getData("application/flowserver-variable");
      if (!variablePayload) return;
      const { variableId } = JSON.parse(variablePayload) as { variableId: string };
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setVariableDrop({ screenX: event.clientX, screenY: event.clientY, flowPosition, variableId });
    },
    [screenToFlowPosition, setVariableDrop],
  );

  return (
    <div className="h-full w-full bg-[#1b1b1b]" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        onPaneContextMenu={onPaneContextMenu}
        colorMode="dark"
        defaultEdgeOptions={{ style: { stroke: "#8f8f8f", strokeWidth: 2 } }}
        // react-flow's own default is `deleteKeyCode: 'Backspace'` only — the physical
        // Delete key does nothing unless explicitly added here too.
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} color="#3a3a3a" gap={18} size={1.5} />
        <Controls />
        <CategoryLegend />
      </ReactFlow>
      {picker && (
        <FunctionGraphNodePicker
          screenX={picker.screenX}
          screenY={picker.screenY}
          flowPosition={picker.flowPosition}
          localNodes={localNodes}
          onAddNode={onAddNode}
          onClose={() => setPicker(null)}
        />
      )}
      {variableDrop &&
        (() => {
          const variable = variables.find((v) => v.id === variableDrop.variableId);
          if (!variable) return null;
          return (
            <VariableDropMenu
              variableName={variable.name}
              x={variableDrop.screenX}
              y={variableDrop.screenY}
              onChoose={(kind) => {
                const type = kind === "get" ? "variable.get" : "variable.set";
                const data: Record<string, unknown> = { variableId: variableDrop.variableId };
                // variable.set's "value" pin is a TEXT_LITERAL_TYPES entry (effectivePorts.ts)
                // — seed data.literals the same way FunctionGraphNodePicker.tsx's
                // handleAddNode already does for every other literal-pin type, so a
                // freshly-dropped Set node isn't immediately flagged invalid before the user
                // has touched it.
                const definition = scopedDefinitions?.[type];
                if (definition) {
                  const literals = defaultLiteralsFor(type, definition);
                  if (literals) data.literals = literals;
                }
                onAddNode(type, variableDrop.flowPosition, data);
                setVariableDrop(null);
              }}
              onClose={() => setVariableDrop(null)}
            />
          );
        })()}
    </div>
  );
}

/**
 * Compact config panel for a selected node inside the blueprint sub-canvas. `NodeConfigPanel`
 * (the main app's equivalent) is bound to the global flowStore and can't reach nodes living in
 * a local `functionGraphStore` instance, so this is a small, purpose-built sibling: generic
 * text/code field rendering driven by whatever `configSchema` the `?scope=function-graph`
 * definitions declare (covers `debug.consoleLog`, `handler.customCode` alike), and a minimal
 * read-only-plus-resultVariable view for `logic.functionCall` (mirroring
 * `FunctionCallConfig`'s precedent in `NodeConfigPanel.tsx`). `logic.graphEntry`/
 * `logic.graphReturn` have empty `configSchema`s and need no fields at all.
 */
function SubCanvasNodeConfig({
  node,
  definition,
  updateNodeData,
  addSwitchCasePin,
  removeSwitchCasePin,
  updateSwitchCaseValue,
  variables,
}: {
  node: Node;
  definition: NodeDefinition | null;
  updateNodeData: (nodeId: string, key: string, value: unknown) => void;
  addSwitchCasePin: (nodeId: string) => void;
  removeSwitchCasePin: (nodeId: string, caseId: string) => void;
  updateSwitchCaseValue: (nodeId: string, caseId: string, value: string | number | boolean) => void;
  variables: VariableDeclaration[];
}) {
  if (!definition) return <p className="text-xs text-neutral-500">Loading…</p>;

  if (node.type === "variable.get" || node.type === "variable.set") {
    const variable = variables.find((v) => v.id === node.data?.variableId);
    if (!variable) {
      return (
        <div className="rounded border border-red-500/60 bg-red-900/20 px-2 py-1.5 text-xs text-red-400">
          References a variable that no longer exists.
        </div>
      );
    }
    return (
      <div className="rounded border border-neutral-700 bg-black/30 px-2 py-1.5 text-xs text-neutral-300">
        Bound to variable &quot;{variable.name}&quot; ({variable.keyword}) — edit it in the Variables panel above.
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
    return <p className="text-xs text-neutral-500">This node has no configuration.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {definition.configSchema.map((field) => (
        <label key={`${node.id}:${field.key}`} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-400">{field.label}</span>
          {field.hint && <span className="text-[11px] text-neutral-500">{field.hint}</span>}
          {field.type === "code" ? (
            <div className="overflow-hidden rounded border border-neutral-700">
              <CodeMirror
                key={`${node.id}:${field.key}`}
                value={String(node.data?.[field.key] ?? "")}
                theme={CODE_MIRROR_THEME}
                height="100px"
                extensions={extensionsForField(field)}
                basicSetup={CODE_MIRROR_BASIC_SETUP}
                onChange={(next) => updateNodeData(node.id, field.key, next)}
              />
            </div>
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
 * The graph-level counterpart to `SubCanvasNodeConfig` — always visible (not gated on node
 * selection), since Function Name/Inputs/Outputs describe the whole graph, not one node.
 * Inputs/Outputs edits go through `functionGraphStore.ts`'s `addParam`/`removeParam`/
 * `renameParam`/`addReturn`/`removeReturn`, which keep the single `logic.graphEntry` node's
 * pins and any wired edges in sync live — no need to close and reopen the modal to see the
 * new pin appear, unlike the old per-parameter-node model this replaced.
 */
function FunctionDetailsPanel({
  functionName,
  onRenameFunction,
  paramNames,
  onAddParam,
  onRemoveParam,
  onRenameParam,
  hasReturnNode,
  onAddReturn,
  onRemoveReturn,
  variables,
  onAddVariable,
  onRenameVariable,
  onSetVariableKeyword,
  onSetVariableDataType,
  onSetVariableDefault,
  onRemoveVariable,
}: {
  functionName: string;
  onRenameFunction: (name: string) => void;
  paramNames: string[];
  onAddParam: (name: string) => void;
  onRemoveParam: (name: string) => void;
  onRenameParam: (oldName: string, newName: string) => void;
  hasReturnNode: boolean;
  onAddReturn: () => void;
  onRemoveReturn: () => void;
  variables: VariableDeclaration[];
  onAddVariable: () => void;
  onRenameVariable: (id: string, name: string) => void;
  onSetVariableKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  onSetVariableDataType: (id: string, dataType: VariableDeclaration["dataType"]) => void;
  onSetVariableDefault: (id: string, value: string) => void;
  onRemoveVariable: (id: string) => void;
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
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Function</h3>
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
          <button
            onClick={handleAddParam}
            title="Add input"
            className="flex h-5 w-5 items-center justify-center rounded border border-neutral-600 text-xs text-neutral-300 hover:border-sky-500 hover:text-sky-400"
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {paramNames.length === 0 && <p className="text-[11px] text-neutral-500">No inputs.</p>}
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
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">Outputs</span>
          {!hasReturnNode && (
            <button
              onClick={onAddReturn}
              title="Add output"
              className="flex h-5 w-5 items-center justify-center rounded border border-neutral-600 text-xs text-neutral-300 hover:border-sky-500 hover:text-sky-400"
            >
              +
            </button>
          )}
        </div>
        {hasReturnNode ? (
          <div className="flex items-center gap-1">
            <span className="flex-1 rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1 text-xs text-neutral-100">
              Return Value
            </span>
            <button
              onClick={onRemoveReturn}
              title="Remove output"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-600 text-xs text-red-400 hover:border-red-500 hover:bg-red-500/10"
            >
              ×
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-neutral-500">No return value.</p>
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
    </div>
  );
}
