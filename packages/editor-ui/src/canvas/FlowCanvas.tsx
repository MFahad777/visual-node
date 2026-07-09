import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  type Connection,
  type Edge,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useFlowStore } from "../store/flowStore.js";
import { useEditorTabsStore } from "../store/editorTabsStore.js";
import { nodeTypes } from "./nodeTypes.js";
import { CustomEdge } from "./CustomEdge.js";
import { NodePickerMenu } from "./NodePickerMenu.js";
import { CategoryLegend } from "./CategoryLegend.js";
import { VariableDropMenu } from "./VariableDropMenu.js";
import { FunctionUsageMenu } from "./FunctionUsageMenu.js";
import { isValidPinConnection } from "./connectionValidation.js";
import type { ResolvedFunction } from "../lib/resolveRequiredFunctions.js";
import type { FunctionUsage } from "./effectivePorts.js";

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

interface FunctionUsageDropState {
  screenX: number;
  screenY: number;
  flowPosition: XYPosition;
}

export function FlowCanvas() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const selectNode = useFlowStore((s) => s.selectNode);
  const addNodeFromPalette = useFlowStore((s) => s.addNodeFromPalette);
  const addFunctionCallNode = useFlowStore((s) => s.addFunctionCallNode);
  const addVariableNode = useFlowStore((s) => s.addVariableNode);
  const variables = useFlowStore((s) => s.variables);
  const openFunctionGraphTab = useEditorTabsStore((s) => s.openFunctionGraphTab);
  const isFunctionGraphOpen = useEditorTabsStore((s) => s.activeTabId !== "main");

  const { screenToFlowPosition } = useReactFlow();

  // A6: read nodes/nodeDefinitions via useFlowStore.getState() inside the callback body
  // instead of closing over the render-time value, so the callback doesn't re-create every
  // drag frame when nodes changes reference.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { nodes, nodeDefinitions } = useFlowStore.getState();
      return isValidPinConnection(connection, nodes, (type) => nodeDefinitions[type ?? ""]);
    },
    [],
  );

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [variableDrop, setVariableDrop] = useState<VariableDropState | null>(null);
  const [functionUsageDrop, setFunctionUsageDrop] = useState<FunctionUsageDropState | null>(null);

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
    [screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const functionCallPayload = event.dataTransfer.getData("application/flowserver-function-call");
      if (functionCallPayload) {
        const entry = JSON.parse(functionCallPayload) as ResolvedFunction;
        addFunctionCallNode(entry, flowPosition);
        return;
      }

      // Variables (Phase 10): rather than placing a node immediately, open a small
      // Get/Set choice menu at the drop point — VariableDropMenu's onChoose is what
      // actually calls addVariableNode with the precomputed flow position above.
      const variablePayload = event.dataTransfer.getData("application/flowserver-variable");
      if (variablePayload) {
        const { variableId } = JSON.parse(variablePayload) as { variableId: string };
        setVariableDrop({ screenX: event.clientX, screenY: event.clientY, flowPosition, variableId });
        return;
      }

      const nodeType = event.dataTransfer.getData("application/flowserver-node-type");
      if (nodeType) {
        // logic.function needs an extra Callback/Standalone choice — see
        // FunctionUsageMenu's doc comment — so it's routed through the same
        // "open a small popup at the drop point" pattern as a Variables-panel drop above,
        // instead of being added immediately.
        if (nodeType === "logic.function") {
          setFunctionUsageDrop({ screenX: event.clientX, screenY: event.clientY, flowPosition });
          return;
        }
        addNodeFromPalette(nodeType, flowPosition);
      }
    },
    [screenToFlowPosition, addFunctionCallNode, addNodeFromPalette],
  );

  return (
    <div className="h-full w-full bg-[#1b1b1b]" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeDoubleClick={(_, node) => {
          if ((node.type === "logic.function" || node.type === "logic.handlerFunction") && node.data?.mode === "blueprint") {
            openFunctionGraphTab(node);
          }
        }}
        onPaneClick={() => selectNode(null)}
        onPaneContextMenu={onPaneContextMenu}
        colorMode="dark"
        defaultEdgeOptions={{ style: { stroke: "#8f8f8f", strokeWidth: 2 } }}
        // react-flow's own default is `deleteKeyCode: 'Backspace'` only — the physical
        // Delete key does nothing unless explicitly added here too. Disabled entirely
        // whenever a function-graph tab is active (Phase 21): react-flow's delete handling
        // attaches a real `document`-level keydown listener regardless of which instance is
        // visually on top, and every open tab's <ReactFlow> stays mounted (visibility
        // toggled via CSS, not unmount) so pan/zoom/selection survive switching tabs — so a
        // single Delete/Backspace press would otherwise delete whatever's selected on THIS
        // canvas too, even while a different tab is focused. See the mirror-image guard in
        // FunctionGraphTabView.tsx's GraphCanvas.
        deleteKeyCode={isFunctionGraphOpen ? null : ["Backspace", "Delete"]}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} color="#3a3a3a" gap={18} size={1.5} />
        <Controls />
        <CategoryLegend />
      </ReactFlow>
      {picker && (
        <NodePickerMenu
          screenX={picker.screenX}
          screenY={picker.screenY}
          flowPosition={picker.flowPosition}
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
                addVariableNode(variableDrop.variableId, kind, variableDrop.flowPosition);
                setVariableDrop(null);
              }}
              onClose={() => setVariableDrop(null)}
            />
          );
        })()}
      {functionUsageDrop && (
        <FunctionUsageMenu
          x={functionUsageDrop.screenX}
          y={functionUsageDrop.screenY}
          onChoose={(usage: FunctionUsage) => {
            addNodeFromPalette("logic.function", functionUsageDrop.flowPosition, { usage });
            setFunctionUsageDrop(null);
          }}
          onClose={() => setFunctionUsageDrop(null)}
        />
      )}
    </div>
  );
}
