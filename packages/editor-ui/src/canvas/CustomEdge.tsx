import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useReactFlow, type EdgeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import type { EdgeWaypoint, NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { useFunctionGraphNodeDefinitions } from "./functionGraphNodeDefinitions.js";
import { useFunctionGraphEdgeContext } from "./functionGraphEdgeContext.js";
import { CATEGORY_THEME } from "./categoryTheme.js";
import { computeEffectiveInputs, computeEffectiveOutputs } from "./effectivePorts.js";
import { isExecPort } from "./execPorts.js";
import { getVariableTypeColor } from "./variableTypeTheme.js";

const FALLBACK_ACCENT = "#8f8f8f";
const EXEC_WIRE_COLOR = "#f5f5f5";

/**
 * Concatenates one `getBezierPath()` segment per consecutive point pair (Phase 31 — reroute
 * anchors). Multiple `M ... C ...` strings back to back in one `<path d="...">` is valid SVG
 * (multiple subpaths) and strokes as a single continuous curve, since each segment's start
 * matches the previous segment's end. A waypoint carries no handle side of its own, so the
 * side at each interior point is inferred from the sign of `dx` to its neighbor. Returns the
 * concatenated path plus a label anchor (the middle segment's own bezier midpoint) for the
 * existing "Disconnect" button.
 */
function buildWaypointPath(
  points: Array<{ x: number; y: number }>,
  firstSide: Position,
  lastSide: Position,
): [string, number, number] {
  let d = "";
  let labelX = points[0].x;
  let labelY = points[0].y;
  const midSegment = Math.floor((points.length - 1) / 2);
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const sourcePosition = i === 0 ? firstSide : from.x <= to.x ? Position.Right : Position.Left;
    const targetPosition = i === points.length - 2 ? lastSide : to.x >= from.x ? Position.Left : Position.Right;
    const [segment, segLabelX, segLabelY] = getBezierPath({
      sourceX: from.x,
      sourceY: from.y,
      sourcePosition,
      targetX: to.x,
      targetY: to.y,
      targetPosition,
      curvature: 0.32,
    });
    d += segment;
    if (i === midSegment) {
      labelX = segLabelX;
      labelY = segLabelY;
    }
  }
  return [d, labelX, labelY];
}

function CustomEdgeImpl({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
  data,
}: EdgeProps) {
  // Inside a Function node's blueprint sub-canvas, `scoped` is non-null (provided by
  // `FunctionGraphTabView`) and every lookup below reads the local `functionGraphStore`'s data
  // through it instead of the global `flowStore` — see `functionGraphEdgeContext.ts`.
  const scoped = useFunctionGraphEdgeContext();
  const functionGraphDefinitions = useFunctionGraphNodeDefinitions();
  const globalNodeDefinitions = useFlowStore((s) => s.nodeDefinitions);
  const globalDeleteEdge = useFlowStore((s) => s.deleteEdge);
  const globalMoveEdgeWaypoint = useFlowStore((s) => s.moveEdgeWaypoint);
  const globalRemoveEdgeWaypoint = useFlowStore((s) => s.removeEdgeWaypoint);
  // A3: move the .find() calls inside the selector functions so Zustand's Object.is check
  // on the selector's output (the individual edge/node object) correctly skips re-rendering
  // edges untouched by a given drag frame.
  const globalEdge = useFlowStore((s) => s.edges.find((e) => e.id === id));
  const globalSourceNode = useFlowStore((s) => s.nodes.find((n) => n.id === source));
  const globalTargetNode = useFlowStore((s) => s.nodes.find((n) => n.id === target));
  const globalVariables = useFlowStore((s) => s.variables);
  const globalHasValidationError = useFlowStore((s) =>
    s.validationErrors.some((e) => e.nodeId === source || e.nodeId === target)
  );
  const { screenToFlowPosition } = useReactFlow();

  const edges = scoped?.edges;
  const nodes = scoped?.nodes;
  const deleteEdge = scoped?.deleteEdge ?? globalDeleteEdge;
  // Phase 31: reroute-anchor drag/remove — same scoped-context-else-global-store fallback
  // every other action here already uses.
  const moveEdgeWaypoint = scoped?.moveEdgeWaypoint ?? globalMoveEdgeWaypoint;
  const removeEdgeWaypoint = scoped?.removeEdgeWaypoint ?? globalRemoveEdgeWaypoint;
  const variables = scoped?.variables ?? globalVariables;
  const edge = scoped ? edges?.find((e) => e.id === id) : globalEdge;
  const sourceNode = scoped ? nodes?.find((n) => n.id === source) : globalSourceNode;
  const targetNode = scoped ? nodes?.find((n) => n.id === target) : globalTargetNode;
  // The sub-canvas has no live per-node validation feed (Live Preview was removed) —
  // errors only ever apply to the main canvas's own node ids.
  const hasError = !scoped && globalHasValidationError;
  // The "in"/"out" chain ports (App/Request/Handler/Next), plus Phase 7's dynamically
  // synthesized exec pins (Branch's true/false, Switch's case-<n>/default), are sequential/
  // structural, not a value, so the wire between them is always plain white — like an exec
  // wire — regardless of either node's category. Every other wire (a real value) is colored
  // by its source node's category, same as before. Resolving both endpoints' actual
  // PortDefinition (rather than a bare id string comparison) is required here because a
  // dynamic pin like Switch's `case-3` has no fixed id to whitelist — computeEffectiveOutputs/
  // computeEffectiveInputs are the same functions GenericNode.tsx uses to render these pins,
  // so the two can never disagree about a pin's kind.

  function definitionFor(type: string | undefined): NodeDefinition | undefined {
    if (!type) return undefined;
    const funcGraphDefs = scoped ? (functionGraphDefinitions as Record<string, NodeDefinition> | undefined) : undefined;
    return funcGraphDefs?.[type] ?? globalNodeDefinitions[type];
  }

  const sourceDefinition = definitionFor(sourceNode?.type);
  const targetDefinition = definitionFor(targetNode?.type);
  const sourcePort = sourceDefinition
    ? computeEffectiveOutputs(sourceNode?.type, sourceNode?.data, sourceDefinition).find(
        (p) => p.id === edge?.sourceHandle,
      )
    : undefined;
  const targetPort = targetDefinition
    ? computeEffectiveInputs(targetNode?.type, targetNode?.data, targetDefinition).find(
        (p) => p.id === edge?.targetHandle,
      )
    : undefined;
  const isExecEdge = Boolean((sourcePort && isExecPort(sourcePort)) || (targetPort && isExecPort(targetPort)));
  const category = sourceDefinition?.category;
  // A wire whose source is a variable.get carries that variable's own type, not a generic
  // "logic"-category value — color it by dataType instead (mirrors GenericNode.tsx's pin
  // coloring). Deliberately source-only: a wire feeding INTO a variable.set's value pin
  // keeps its normal source-based coloring — only the Set node's own pin dot (GenericNode.tsx)
  // reflects the bound variable's type, per the Phase 10 follow-up design. A dangling
  // `data.variableId` falls back to the ordinary category color rather than crashing.
  const sourceVariable =
    sourceNode?.type === "variable.get"
      ? variables.find((v) => v.id === (sourceNode?.data as Record<string, unknown> | undefined)?.variableId)
      : undefined;
  const accentColor = isExecEdge
    ? EXEC_WIRE_COLOR
    : sourceVariable
      ? getVariableTypeColor(sourceVariable.dataType)
      : (category && CATEGORY_THEME[category]?.accentHex) || FALLBACK_ACCENT;

  const waypoints = (data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints ?? [];

  const [edgePath, labelX, labelY] =
    waypoints.length === 0
      ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.32 })
      : buildWaypointPath(
          [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }],
          sourcePosition,
          targetPosition,
        );

  const handleWaypointDrag = useCallback(
    (waypointId: string, event: React.PointerEvent) => {
      if (event.buttons !== 1) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      moveEdgeWaypoint(id, waypointId, point);
    },
    [screenToFlowPosition, moveEdgeWaypoint, id],
  );

  const computedStyle = hasError
    ? { ...style, stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "6 4" }
    : {
        ...style,
        stroke: accentColor,
        strokeWidth: 2,
        filter: `drop-shadow(0 0 3px ${accentColor}88)`,
      };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={computedStyle} />
      <EdgeLabelRenderer>
        {selected && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              deleteEdge(id);
            }}
            title="Disconnect"
            className="nodrag nopan flex h-5 w-5 items-center justify-center rounded-full border border-red-400 bg-[#2a2a2a] text-[11px] leading-none text-red-400 hover:bg-red-500 hover:text-white"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            ×
          </button>
        )}
        {/* Phase 31: reroute anchors — dropped via double-clicking the wire (FlowCanvas.tsx's/
            FunctionGraphTabView.tsx's onEdgeDoubleClick), dragged via pointer capture, removed
            via double-click or (once focused) the Delete/Backspace key. Always rendered
            regardless of `selected`, unlike the disconnect button above — an anchor is a
            permanent routing aid, not a selection-only affordance. */}
        {waypoints.map((wp) => (
          <div
            key={wp.id}
            tabIndex={0}
            title="Drag to reroute — double-click or press Delete to remove"
            className="nodrag nopan rounded-full focus:outline-none focus:ring-2 focus:ring-white"
            onPointerDown={(event) => {
              event.stopPropagation();
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              handleWaypointDrag(wp.id, event);
            }}
            onPointerUp={(event) => {
              (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              removeEdgeWaypoint(id, wp.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                // Stops this keypress from also bubbling to `document`, where React Flow's
                // own `deleteKeyCode` listener lives — without this, deleting the focused
                // anchor would *also* be interpreted as "delete the selected node/edge".
                event.stopPropagation();
                removeEdgeWaypoint(id, wp.id);
              }
            }}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
              width: 10,
              height: 10,
              background: accentColor,
              border: "1px solid rgba(0,0,0,0.5)",
              cursor: "grab",
              pointerEvents: "all",
            }}
          />
        ))}
      </EdgeLabelRenderer>
    </>
  );
}

// A3: wrap in React.memo with the default shallow comparator. Every EdgeProps field is
// meaningful and should trigger a re-render when it changes (unlike GenericNode's custom
// comparator which deliberately excludes drag-frame fields).
export const CustomEdge = memo(CustomEdgeImpl);
