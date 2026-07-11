import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  SelectionMode,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type EdgeMouseHandler,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { NodeDefinition, VariableDeclaration } from "@visual-node/core";
import { useEditorTabsStore } from "../store/editorTabsStore.js";
import { useFlowStore } from "../store/flowStore.js";
import type { FunctionGraphStore } from "../store/functionGraphStore.js";
import { nodeTypes } from "../canvas/nodeTypes.js";
import { CustomEdge } from "../canvas/CustomEdge.js";
import { CategoryLegend } from "../canvas/CategoryLegend.js";
import { FunctionGraphNodeDefinitionsContext, useFunctionGraphNodeDefinitions } from "../canvas/functionGraphNodeDefinitions.js";
import { defaultLiteralsFor } from "../canvas/effectivePorts.js";
import { isValidPinConnection } from "../canvas/connectionValidation.js";
import { bestInsertIndex } from "../canvas/edgeWaypoints.js";
import { FunctionGraphEdgeContext } from "../canvas/functionGraphEdgeContext.js";
import { VariableDropMenu } from "../canvas/VariableDropMenu.js";
import { FunctionGraphNodePicker } from "./FunctionGraphNodePicker.js";
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
  /** Phase 25: which pool `variableId` came from — the drag payload carries this so the drop handler resolves it against the right list. */
  scope: "local" | "module";
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
  const deleteSelectedNode = tabStore((s) => s.deleteSelectedNode);
  const openCommentExpand = tabStore((s) => s.openCommentExpand);
  const addEdgeWaypoint = tabStore((s) => s.addEdgeWaypoint);
  const moveEdgeWaypoint = tabStore((s) => s.moveEdgeWaypoint);
  const removeEdgeWaypoint = tabStore((s) => s.removeEdgeWaypoint);
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
  const setZoom = tabStore((s) => s.setZoom);
  const currentZoom = tabStore((s) => s.currentZoom);
  const addCommentGroup = tabStore((s) => s.addCommentGroup);
  const reparentNodeOnDragStop = tabStore((s) => s.reparentNodeOnDragStop);
  // Phase 25: the outer/main-canvas module-level variable list, read straight off the global
  // flowStore singleton — no prop threading needed, same store any other component in this app
  // reads directly. Kept separate from the tab's own local `variables` above.
  const moduleVariables = useFlowStore((s) => s.variables);

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [variableDrop, setVariableDrop] = useState<VariableDropState | null>(null);

  // GenericNode (shared with the main canvas) can't resolve graphEntry/graphReturn from the
  // global flowStore — those types are deliberately excluded from it. Fetch the scoped
  // definitions and provide them via context so this sub-canvas's nodes render correctly
  // instead of falling into GenericNode's "Unknown node type" branch. B1: use the shared
  // cached fetchNodeRegistry to dedupe concurrent tab opens and avoid redundant fetches.
  const [functionGraphDefinitions, setFunctionGraphDefinitions] = useState<Record<string, NodeDefinition> | null>(
    null,
  );

  useEffect(() => {
    api.fetchNodeRegistryCached("function-graph").then((result) => {
      const defs = Object.fromEntries(result.definitions.map((d) => [d.type, d]));
      setFunctionGraphDefinitions(defs);
    });
  }, []);

  // A7: wrap the context value object in useMemo so updates to any constituent field
  // don't defeat the GenericNode/CustomEdge memo boundaries for consumers reading this context.
  // MUST be called unconditionally (before the early return below) to satisfy React's Rules of Hooks.
  const edgeContextValue = useMemo(
    () => ({
      edges,
      nodes,
      deleteEdge,
      openCommentExpand,
      moveEdgeWaypoint,
      removeEdgeWaypoint,
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
      moduleVariables,
      currentZoom,
    }),
    [
      edges,
      nodes,
      deleteEdge,
      openCommentExpand,
      moveEdgeWaypoint,
      removeEdgeWaypoint,
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
      moduleVariables,
      currentZoom,
    ]
  );

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
      <FunctionGraphEdgeContext.Provider value={edgeContextValue}>
        <ReactFlowProvider>
          <GraphCanvas
            functionNodeId={functionNodeId}
            isActive={isActive}
            nodes={nodes}
            edges={edges as Edge[]}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            addEdgeWaypoint={addEdgeWaypoint}
            addCommentGroup={addCommentGroup}
            reparentNodeOnDragStop={reparentNodeOnDragStop}
            picker={picker}
            setPicker={setPicker}
            variableDrop={variableDrop}
            setVariableDrop={setVariableDrop}
            variables={variables}
            moduleVariables={moduleVariables}
            localNodes={nodes}
            onAddNode={(type, position, data) => tabStore.getState().addNode(type, position, data)}
            onSelectNode={selectNode}
            deleteSelectedNode={deleteSelectedNode}
            setZoom={setZoom}
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
  addEdgeWaypoint,
  addCommentGroup,
  reparentNodeOnDragStop,
  picker,
  setPicker,
  variableDrop,
  setVariableDrop,
  variables,
  moduleVariables,
  localNodes,
  onAddNode,
  onSelectNode,
  deleteSelectedNode,
  setZoom,
}: {
  functionNodeId: string;
  isActive: boolean;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addEdgeWaypoint: (edgeId: string, index: number, point: XYPosition) => void;
  addCommentGroup: (bounds: { x: number; y: number; width: number; height: number }, title?: string, memberIds?: string[]) => void;
  reparentNodeOnDragStop: (nodeId: string) => void;
  picker: PickerState | null;
  setPicker: (p: PickerState | null) => void;
  variableDrop: VariableDropState | null;
  setVariableDrop: (v: VariableDropState | null) => void;
  variables: VariableDeclaration[];
  moduleVariables: VariableDeclaration[];
  localNodes: Array<{ type?: string; data?: Record<string, unknown> }>;
  onAddNode: (type: string, position: XYPosition, data: Record<string, unknown>) => void;
  onSelectNode: (nodeId: string | null) => void;
  deleteSelectedNode: () => void;
  setZoom: (zoom: number) => void;
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

  // Phase 31: mirrors FlowCanvas.tsx's onEdgeDoubleClick — drops a reroute anchor at the
  // click point, inserted via the nearest-insertion heuristic over
  // [sourceNode, ...existingWaypoints, targetNode].
  const onEdgeDoubleClick: EdgeMouseHandler<Edge> = useCallback(
    (event, edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) return;
      const liveEdge = edges.find((e) => e.id === edge.id);
      const existingWaypoints =
        (liveEdge?.data as { waypoints?: Array<{ x: number; y: number }> } | undefined)?.waypoints ?? [];
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const index = bestInsertIndex([sourceNode.position, ...existingWaypoints, targetNode.position], point);
      addEdgeWaypoint(edge.id, index, point);
    },
    [nodes, edges, screenToFlowPosition, addEdgeWaypoint],
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
      const variablePayload = event.dataTransfer.getData("application/visual-node-variable");
      if (!variablePayload) return;
      const { variableId, scope } = JSON.parse(variablePayload) as {
        variableId: string;
        scope?: "local" | "module";
      };
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setVariableDrop({ screenX: event.clientX, screenY: event.clientY, flowPosition, variableId, scope: scope ?? "local" });
    },
    [screenToFlowPosition, setVariableDrop],
  );

  // Phase 34: C-key listener for creating comment group boxes around selected nodes.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Guard: not active when this tab isn't visible, or when typing in an input
      if (!isActive) return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
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
          addCommentGroup(
            {
              x: minX - padding,
              y: minY - topPadding,
              width: maxX - minX + padding * 2,
              height: maxY - minY + topPadding + padding,
            },
            undefined,
            selectedNodes.map((n) => n.id),
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
  }, [isActive, nodes, addCommentGroup]);

  // Phase 34: Custom Delete/Backspace handler to orphan children when deleting comment groups.
  // React Flow's built-in deleteKeyCode would auto-delete children, but we want them to
  // survive as free nodes instead. Disabled whenever this tab is not active to avoid
  // interfering with other tabs' delete handling (same rationale as deleteKeyCode guard).
  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (!isActive) return;
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
  }, [isActive, deleteSelectedNode]);

  const onNodeDragStop = useCallback(
    (event: MouseEvent | TouchEvent, node: Node) => {
      if (node.type !== "annotation.commentGroup") {
        reparentNodeOnDragStop(node.id);
      }
    },
    [reparentNodeOnDragStop],
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
        onEdgeDoubleClick={onEdgeDoubleClick}
        isValidConnection={isValidConnection}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => onSelectNode(null)}
        onPaneContextMenu={onPaneContextMenu}
        // Box-select (hold Shift + left-drag, react-flow's default selectionKeyCode) picks
        // up any node the drag box touches rather than requiring full containment — mirrors
        // the same change in FlowCanvas.tsx's main canvas.
        selectionMode={SelectionMode.Partial}
        // Keep this tab's selectedNodeId in sync with react-flow's own selection state, not
        // just clicks — see the matching comment in FlowCanvas.tsx for the full rationale.
        onSelectionChange={({ nodes: selectedNodes }) =>
          onSelectNode(selectedNodes.length === 1 ? selectedNodes[0].id : null)
        }
        colorMode="dark"
        defaultEdgeOptions={{ style: { stroke: "#8f8f8f", strokeWidth: 2 } }}
        // Phase 34: Disabled React Flow's built-in deleteKeyCode handler entirely and replaced it
        // with a custom document-level listener (handleDelete) that calls deleteSelectedNode
        // from the store. This allows us to orphan children when deleting comment groups
        // instead of auto-deleting them. The custom handler has the same isActive guard
        // (disabled when this tab is not active) and the same input-focus guards.
        deleteKeyCode={null}
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
          const pool = variableDrop.scope === "module" ? moduleVariables : variables;
          const variable = pool.find((v) => v.id === variableDrop.variableId);
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
