import { useCallback, useEffect, useRef, useState } from "react";
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
import type { NodeDefinition, VariableDeclaration } from "@visual-node/core";
import { useEditorTabsStore } from "../store/editorTabsStore.js";
import type { FunctionGraphStore } from "../store/functionGraphStore.js";
import { nodeTypes } from "../canvas/nodeTypes.js";
import { CustomEdge } from "../canvas/CustomEdge.js";
import { CategoryLegend } from "../canvas/CategoryLegend.js";
import { FunctionGraphNodeDefinitionsContext, useFunctionGraphNodeDefinitions } from "../canvas/functionGraphNodeDefinitions.js";
import { defaultLiteralsFor } from "../canvas/effectivePorts.js";
import { isValidPinConnection } from "../canvas/connectionValidation.js";
import { FunctionGraphEdgeContext } from "../canvas/functionGraphEdgeContext.js";
import { VariableDropMenu } from "../canvas/VariableDropMenu.js";
import { FunctionGraphNodePicker } from "./FunctionGraphNodePicker.js";
import * as api from "../api/client.js";

const edgeTypes = { "flow-edge": CustomEdge };

// Shared cache for function-graph node definitions — initialized once, reused across all tabs.
let nodeRegistryCacheGlobal: Record<string, NodeDefinition> | null = null;

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
 * Canvas half of one function-graph tab (Phase 21). Mounted once per open tab by `App.tsx`,
 * keyed on `functionNodeId`, and kept mounted (visibility toggled via a CSS `hidden` class,
 * not conditional unmount) for as long as the tab stays open — so pan/zoom/selection survive
 * switching tabs, unlike the old `FunctionGraphModal` which recreated its canvas on every
 * open. `tabStore` is created once by `editorTabsStore.ts`'s `openFunctionGraphTab` and lives
 * for the tab's whole lifetime; this component owns no graph state of its own beyond local UI
 * popups (node picker, variable-drop menu). The sidebar half (Function Details / Node Config)
 * lives in `FunctionGraphSidePanel.tsx`, rendered separately by `App.tsx` only for the
 * currently active tab.
 */
export function FunctionGraphTabView({
  functionNodeId,
  tabStore,
}: {
  functionNodeId: string;
  tabStore: FunctionGraphStore;
}) {
  const isActive = useEditorTabsStore((s) => s.activeTabId === functionNodeId);

  const nodes = tabStore((s) => s.nodes);
  const edges = tabStore((s) => s.edges);
  const onNodesChange = tabStore((s) => s.onNodesChange);
  const onEdgesChange = tabStore((s) => s.onEdgesChange);
  const onConnect = tabStore((s) => s.onConnect);
  const deleteEdge = tabStore((s) => s.deleteEdge);
  const updateNodeData = tabStore((s) => s.updateNodeData);
  const addInputPin = tabStore((s) => s.addInputPin);
  const removeInputPin = tabStore((s) => s.removeInputPin);
  const addSwitchCasePin = tabStore((s) => s.addSwitchCasePin);
  const removeSwitchCasePin = tabStore((s) => s.removeSwitchCasePin);
  const updateSwitchCaseValue = tabStore((s) => s.updateSwitchCaseValue);
  const addSequencePin = tabStore((s) => s.addSequencePin);
  const removeSequencePin = tabStore((s) => s.removeSequencePin);
  const addPathExtractorParam = tabStore((s) => s.addPathExtractorParam);
  const removePathExtractorParam = tabStore((s) => s.removePathExtractorParam);
  const addCallbackArg = tabStore((s) => s.addCallbackArg);
  const removeCallbackArg = tabStore((s) => s.removeCallbackArg);
  const variables = tabStore((s) => s.variables);
  const selectNode = tabStore((s) => s.selectNode);

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [variableDrop, setVariableDrop] = useState<VariableDropState | null>(null);

  // GenericNode (shared with the main canvas) can't resolve graphEntry/graphReturn from the
  // global flowStore — those types are deliberately excluded from it. Fetch the scoped
  // definitions once per tab and provide them via context so this sub-canvas's nodes render
  // correctly instead of falling into GenericNode's "Unknown node type" branch.
  const [functionGraphDefinitions, setFunctionGraphDefinitions] = useState<Record<string, NodeDefinition> | null>(
    nodeRegistryCacheGlobal,
  );

  useEffect(() => {
    // If we already have the result cached, use it immediately.
    if (nodeRegistryCacheGlobal) {
      setFunctionGraphDefinitions(nodeRegistryCacheGlobal);
      return;
    }

    api.fetchNodeRegistry("function-graph").then((result) => {
      const defs = Object.fromEntries(result.definitions.map((d) => [d.type, d]));
      nodeRegistryCacheGlobal = defs;
      setFunctionGraphDefinitions(defs);
    });
  }, []);

  // Don't render ReactFlow until node definitions have loaded — React Flow validates edges on
  // mount, and if handles aren't defined yet (because definitions are still null), edge
  // validation fails with "Couldn't create edge" errors. Phase 21 changed this from a modal
  // that unmounted on close (definitions fetched fresh each open) to persistent tabs (same store
  // across tab switches), so the async fetch must complete before any edge rendering.
  if (!functionGraphDefinitions) {
    return <div className="h-full w-full bg-[#1b1b1b]" />;
  }

  return (
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
          addSequencePin,
          removeSequencePin,
          addPathExtractorParam,
          removePathExtractorParam,
          addCallbackArg,
          removeCallbackArg,
          variables,
        }}
      >
        <ReactFlowProvider>
          <GraphCanvas
            functionNodeId={functionNodeId}
            isActive={isActive}
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
            onAddNode={(type, position, data) => tabStore.getState().addNode(type, position, data)}
            onSelectNode={selectNode}
          />
        </ReactFlowProvider>
      </FunctionGraphEdgeContext.Provider>
    </FunctionGraphNodeDefinitionsContext.Provider>
  );
}

/**
 * Split out so `useReactFlow()` (which requires a `ReactFlowProvider` ancestor) can be
 * called for the context-menu position math, mirroring `FlowCanvas.tsx`.
 */
function GraphCanvas({
  functionNodeId,
  isActive,
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
  functionNodeId: string;
  isActive: boolean;
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

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      isValidPinConnection(connection, nodes, (type) => scopedDefinitions?.[type ?? ""]),
    [nodes, scopedDefinitions],
  );

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
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        onPaneContextMenu={onPaneContextMenu}
        colorMode="dark"
        defaultEdgeOptions={{ style: { stroke: "#8f8f8f", strokeWidth: 2 } }}
        // Every open function-graph tab's <ReactFlow> stays mounted (Phase 21 tabs, unlike
        // the old single modal, can have several open at once) — react-flow's delete
        // handling attaches a real `document`-level keydown listener regardless of which
        // instance is visually on top, so only the currently active tab may respond to
        // Delete/Backspace; every other mounted-but-hidden tab (including the Main Graph)
        // must have it disabled. See FlowCanvas.tsx's mirror-image guard.
        deleteKeyCode={isActive ? ["Backspace", "Delete"] : null}
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
          currentFunctionNodeId={functionNodeId}
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
