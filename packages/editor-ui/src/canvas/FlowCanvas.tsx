import { useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type XYPosition,
  type Node,
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
import { bestInsertIndex } from "./edgeWaypoints.js";
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
  const setZoom = useFlowStore((s) => s.setZoom);
  const addNodeFromPalette = useFlowStore((s) => s.addNodeFromPalette);
  const addFunctionCallNode = useFlowStore((s) => s.addFunctionCallNode);
  const addVariableNode = useFlowStore((s) => s.addVariableNode);
  const addEdgeWaypoint = useFlowStore((s) => s.addEdgeWaypoint);
  const addCommentGroup = useFlowStore((s) => s.addCommentGroup);
  const deleteSelectedNode = useFlowStore((s) => s.deleteSelectedNode);
  const reparentNodeOnDragStop = useFlowStore((s) => s.reparentNodeOnDragStop);
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

  // Phase 31: double-clicking anywhere along a wire drops a reroute anchor at that exact
  // point. Insertion index among any anchors the wire already has is chosen via the
  // nearest-insertion heuristic (bestInsertIndex) over [sourceNode, ...waypoints, targetNode] —
  // node position (not exact pin position) is an adequate approximation for this ordering
  // decision. A6-style: read nodes/edges via getState() inside the callback so this doesn't
  // need to re-create every time nodes/edges change reference.
  const onEdgeDoubleClick: EdgeMouseHandler<Edge> = useCallback(
    (event, edge) => {
      const { nodes, edges } = useFlowStore.getState();
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) return;
      const liveEdge = edges.find((e) => e.id === edge.id);
      const existingWaypoints = (liveEdge?.data as { waypoints?: Array<{ x: number; y: number }> } | undefined)
        ?.waypoints ?? [];
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const index = bestInsertIndex([sourceNode.position, ...existingWaypoints, targetNode.position], point);
      addEdgeWaypoint(edge.id, index, point);
    },
    [screenToFlowPosition, addEdgeWaypoint],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const functionCallPayload = event.dataTransfer.getData("application/visual-node-function-call");
      if (functionCallPayload) {
        const entry = JSON.parse(functionCallPayload) as ResolvedFunction;
        addFunctionCallNode(entry, flowPosition);
        return;
      }

      // Variables (Phase 10): rather than placing a node immediately, open a small
      // Get/Set choice menu at the drop point — VariableDropMenu's onChoose is what
      // actually calls addVariableNode with the precomputed flow position above.
      const variablePayload = event.dataTransfer.getData("application/visual-node-variable");
      if (variablePayload) {
        const { variableId } = JSON.parse(variablePayload) as { variableId: string };
        setVariableDrop({ screenX: event.clientX, screenY: event.clientY, flowPosition, variableId });
        return;
      }

      const nodeType = event.dataTransfer.getData("application/visual-node-node-type");
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

  // Phase 33: C-key listener for creating comment group boxes around selected nodes.
  // A6-style: read nodes via getState() inside the callback to avoid re-creating on every
  // state change.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Guard: not active when function-graph tab is open, or when typing in an input
      if (isFunctionGraphOpen) return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        const { nodes } = useFlowStore.getState();
        const selectedNodes = nodes.filter((n) => n.selected && n.type !== "annotation.commentGroup");

        if (selectedNodes.length > 0) {
          // Compute bounding box with padding
          const positions = selectedNodes.map((n) => ({
            x: n.position.x,
            y: n.position.y,
            w: n.width ?? 190,
            h: n.height ?? 200,
          }));
          const minX = Math.min(...positions.map((p) => p.x));
          const maxX = Math.max(...positions.map((p) => p.x + p.w));
          const minY = Math.min(...positions.map((p) => p.y));
          const maxY = Math.max(...positions.map((p) => p.y + p.h));

          const padding = 40;
          const topPadding = 50; // Extra space for title row
          const memberIds = selectedNodes.map((n) => n.id);
          addCommentGroup(
            {
              x: minX - padding,
              y: minY - topPadding,
              width: maxX - minX + padding * 2,
              height: maxY - minY + topPadding + padding,
            },
            undefined,
            memberIds,
          );
        } else {
          // No selection: create a default-sized box in viewport center (approx)
          addCommentGroup({
            x: 200,
            y: 100,
            width: 220,
            height: 120,
          });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFunctionGraphOpen, addCommentGroup]);

  // Phase 34: Custom Delete/Backspace handler to orphan children when deleting comment groups.
  // React Flow's built-in deleteKeyCode would auto-delete children, but we want them to
  // survive as free nodes instead. Disabled whenever a function-graph tab is active to avoid
  // interfering with that tab's own delete handling (same rationale as deleteKeyCode guard).
  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (isFunctionGraphOpen) return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedNode();
      }
    };

    document.addEventListener("keydown", handleDelete);
    return () => document.removeEventListener("keydown", handleDelete);
  }, [isFunctionGraphOpen, deleteSelectedNode]);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      // Skip reparenting for comment-group nodes themselves — React Flow handles their
      // children's movement natively via parentId composition. Reparent regular nodes
      // to reflect current group membership based on overlap.
      if (node.type === "annotation.commentGroup") {
        return;
      }
      reparentNodeOnDragStop(node.id);
    },
    [reparentNodeOnDragStop],
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
        onEdgeDoubleClick={onEdgeDoubleClick}
        isValidConnection={isValidConnection}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeDoubleClick={(_, node) => {
          if ((node.type === "logic.function" || node.type === "logic.handlerFunction") && node.data?.mode === "blueprint") {
            openFunctionGraphTab(node);
          }
        }}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => selectNode(null)}
        onPaneContextMenu={onPaneContextMenu}
        // Box-select (hold Shift + left-drag, react-flow's default selectionKeyCode) picks
        // up any node the drag box touches rather than requiring full containment — matches
        // how a marquee-select is expected to behave in a node/graph editor.
        selectionMode={SelectionMode.Partial}
        // Keep selectedNodeId in sync with react-flow's own selection state, not just clicks:
        // box-selecting doesn't go through onNodeClick, so without this the config panel would
        // keep showing whatever single node was last plain-clicked. Fires after click-driven
        // selection settles, so it always wins over onNodeClick/onPaneClick with no flicker.
        onSelectionChange={({ nodes: selectedNodes }) =>
          selectNode(selectedNodes.length === 1 ? selectedNodes[0].id : null)
        }
        colorMode="dark"
        defaultEdgeOptions={{ style: { stroke: "#8f8f8f", strokeWidth: 2 } }}
        // Phase 34: Disabled React Flow's built-in deleteKeyCode handler entirely and replaced it
        // with a custom document-level listener (handleDelete) that calls deleteSelectedNode
        // from the store. This allows us to orphan children when deleting comment groups
        // instead of auto-deleting them. The custom handler has the same phase-21 guard
        // (disabled when function-graph tab is active) and the same input-focus guards.
        deleteKeyCode={null}
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
