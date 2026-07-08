import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { useFunctionGraphNodeDefinitions } from "./functionGraphNodeDefinitions.js";
import { useFunctionGraphEdgeContext } from "./functionGraphEdgeContext.js";
import { CATEGORY_THEME } from "./categoryTheme.js";
import { computeEffectiveInputs, computeEffectiveOutputs } from "./effectivePorts.js";
import { isExecPort } from "./execPorts.js";
import { getVariableTypeColor } from "./variableTypeTheme.js";

const FALLBACK_ACCENT = "#8f8f8f";
const EXEC_WIRE_COLOR = "#f5f5f5";

export function CustomEdge({
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
}: EdgeProps) {
  // Inside a Function node's blueprint sub-canvas, `scoped` is non-null (provided by
  // `FunctionGraphTabView`) and every lookup below reads the local `functionGraphStore`'s data
  // through it instead of the global `flowStore` — see `functionGraphEdgeContext.ts`.
  const scoped = useFunctionGraphEdgeContext();
  const functionGraphDefinitions = useFunctionGraphNodeDefinitions();
  const globalEdges = useFlowStore((s) => s.edges);
  const globalNodes = useFlowStore((s) => s.nodes);
  const globalNodeDefinitions = useFlowStore((s) => s.nodeDefinitions);
  const globalValidationErrors = useFlowStore((s) => s.validationErrors);
  const globalDeleteEdge = useFlowStore((s) => s.deleteEdge);
  const globalVariables = useFlowStore((s) => s.variables);

  const edges = scoped?.edges ?? globalEdges;
  const nodes = scoped?.nodes ?? globalNodes;
  const deleteEdge = scoped?.deleteEdge ?? globalDeleteEdge;
  const variables = scoped?.variables ?? globalVariables;
  // The sub-canvas has no live per-node validation feed (Live Preview was removed) —
  // errors only ever apply to the main canvas's own node ids.
  const hasError = !scoped && globalValidationErrors.some((e) => e.nodeId === source || e.nodeId === target);
  // The "in"/"out" chain ports (App/Request/Handler/Next), plus Phase 7's dynamically
  // synthesized exec pins (Branch's true/false, Switch's case-<n>/default), are sequential/
  // structural, not a value, so the wire between them is always plain white — like an exec
  // wire — regardless of either node's category. Every other wire (a real value) is colored
  // by its source node's category, same as before. Resolving both endpoints' actual
  // PortDefinition (rather than a bare id string comparison) is required here because a
  // dynamic pin like Switch's `case-3` has no fixed id to whitelist — computeEffectiveOutputs/
  // computeEffectiveInputs are the same functions GenericNode.tsx uses to render these pins,
  // so the two can never disagree about a pin's kind.
  const edge = edges.find((e) => e.id === id);
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  function definitionFor(type: string | undefined): NodeDefinition | undefined {
    if (!type) return undefined;
    return functionGraphDefinitions?.[type] ?? globalNodeDefinitions[type];
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

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.32,
  });

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
      {selected && (
        <EdgeLabelRenderer>
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
        </EdgeLabelRenderer>
      )}
    </>
  );
}
