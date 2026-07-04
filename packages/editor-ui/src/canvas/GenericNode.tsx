import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PortDefinition, VariableDeclaration } from "@flowserver/core";
import { useFlowStore } from "../store/flowStore.js";
import { useFunctionGraphNodeDefinitions } from "./functionGraphNodeDefinitions.js";
import { useFunctionGraphEdgeContext } from "./functionGraphEdgeContext.js";
import { CATEGORY_THEME } from "./categoryTheme.js";
import { CategoryIcon } from "./CategoryIcon.js";
import { getVariableTypeColor } from "./variableTypeTheme.js";
import { computeEffectiveInputs, computeEffectiveOutputs, literalKindFor, VARIADIC_BOOLEAN_TYPES } from "./effectivePorts.js";
import { isExecPort } from "./execPorts.js";

function summarize(type: string, data: Record<string, unknown>, variables: VariableDeclaration[]): string | null {
  switch (type) {
    case "express.listen":
      return `port: ${data.port ?? 3000}`;
    case "express.route":
      return `${data.method ?? "GET"} ${data.path ?? "/"}`;
    case "handler.sendJson":
      return `status ${data.statusCode ?? 200}`;
    case "handler.customCode": {
      const code = String(data.code ?? "");
      return code.length > 0 ? `${code.slice(0, 24)}${code.length > 24 ? "…" : ""}` : "(empty)";
    }
    case "logic.function": {
      const name = String(data.name ?? "");
      return name.length > 0 ? `${name}(${data.params ?? ""})` : "(unnamed)";
    }
    case "logic.require":
      return `${data.variableName ?? "?"} = require(${JSON.stringify(data.path ?? "")})`;
    case "debug.consoleLog": {
      const expression = String(data.expression ?? "");
      return expression.length > 0 ? expression : "(empty)";
    }
    // Phase 10: resolved live from the current store's `variables` list (not cached on the
    // node, which only ever stores the opaque `variableId`) so a rename in the Variables
    // panel is reflected on every referencing canvas node instantly.
    case "variable.get": {
      const variable = variables.find((v) => v.id === data.variableId);
      return variable ? `Get ${variable.name}` : "Get (missing variable)";
    }
    case "variable.set": {
      const variable = variables.find((v) => v.id === data.variableId);
      return variable ? `Set ${variable.name}` : "Set (missing variable)";
    }
    default:
      return null;
  }
}

function isLongForm(type: string): boolean {
  return type === "handler.customCode";
}

export type GenericNodeProps = NodeProps;

export function GenericNode({ id, type, data, selected }: GenericNodeProps) {
  const globalDefinitions = useFlowStore((s) => s.nodeDefinitions);
  // Function-graph-only types (logic.graphEntry/graphReturn) are deliberately
  // absent from `globalDefinitions` (see functionGraphNodeDefinitions.ts) — when rendering
  // inside a Function node's blueprint sub-canvas, FunctionGraphModal provides this context
  // with the scoped definitions those types actually need to render correctly.
  const functionGraphDefinitions = useFunctionGraphNodeDefinitions();
  const definition = type ? (functionGraphDefinitions?.[type] ?? globalDefinitions[type]) : undefined;
  const errors = useFlowStore((s) => s.validationErrors.filter((e) => e.nodeId === id));
  // Mirrors CustomEdge's scoped/global fallback (functionGraphEdgeContext.ts): inside a
  // Function node's blueprint sub-canvas, edges live in a local functionGraphStore with
  // `fgedge_*` ids that never match the global flowStore, so pin-connected checks below
  // would always miss and never glow without reading the scoped edges here instead.
  const scopedEdgeContext = useFunctionGraphEdgeContext();
  const globalEdges = useFlowStore((s) => s.edges);
  const edges = scopedEdgeContext?.edges ?? globalEdges;

  // Phase 10: same scoped/global fallback, for resolving a variable.get/variable.set
  // node's bound variableId to a display name in summarize() below.
  const globalVariables = useFlowStore((s) => s.variables);
  const variables = scopedEdgeContext?.variables ?? globalVariables;

  // Same scoped/global fallback for the Phase 7 dynamic-pin/literal-editing mutations below:
  // inside a Function node's blueprint sub-canvas these must hit the local functionGraphStore
  // instance (provided via context by FunctionGraphModal), not the global flowStore, or the
  // edit would silently target a node id that doesn't exist there.
  const globalUpdateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const globalAddInputPin = useFlowStore((s) => s.addInputPin);
  const globalRemoveInputPin = useFlowStore((s) => s.removeInputPin);
  const updateNodeData = scopedEdgeContext?.updateNodeData ?? globalUpdateNodeConfig;
  const addInputPin = scopedEdgeContext?.addInputPin ?? globalAddInputPin;
  const removeInputPin = scopedEdgeContext?.removeInputPin ?? globalRemoveInputPin;

  if (!definition) {
    return (
      <div className="rounded border border-red-500 bg-neutral-900 px-3 py-2 text-xs text-red-400">
        Unknown node type: {type}
      </div>
    );
  }

  const hasError = errors.length > 0;
  const summary = summarize(type ?? "", (data ?? {}) as Record<string, unknown>, variables);
  const theme = CATEGORY_THEME[definition.category];
  const accentHex = theme.accentHex;

  // A variable.get's single "value" output and a variable.set's "value" input carry the
  // bound variable's own type, not a generic "logic"-category value — resolve it the same
  // way summarize() above resolves the bound variable's name, so a Get/Set node's pin (and,
  // via CustomEdge.tsx, its outgoing wire) render in that variable's color. A dangling
  // `data.variableId` (variable removed from the panel but the node left on canvas) falls
  // back to the ordinary category color rather than crashing.
  const boundVariable =
    type === "variable.get" || type === "variable.set"
      ? variables.find((v) => v.id === (data as Record<string, unknown> | undefined)?.variableId)
      : undefined;
  const valuePinColor = (port: PortDefinition): string =>
    boundVariable && port.id === "value" ? getVariableTypeColor(boundVariable.dataType) : accentHex;

  const showSubtitle = !!summary && !isLongForm(type ?? "");
  const showBodyChip = !!summary && isLongForm(type ?? "");

  const isInputConnected = (portId: string) =>
    edges.some((e) => e.target === id && e.targetHandle === portId);
  const isOutputConnected = (portId: string) =>
    edges.some((e) => e.source === id && e.sourceHandle === portId);

  const pinStyle = (connected: boolean, color: string = accentHex) =>
    connected
      ? {
          width: 12,
          height: 12,
          background: color,
          border: `2px solid ${color}`,
          borderRadius: "50%",
          boxShadow: `0 0 4px ${color}`,
        }
      : {
          width: 12,
          height: 12,
          background: "#1e1e1e",
          border: `2px solid ${color}`,
          borderRadius: "50%",
        };

  // The "in"/"out" chain ports (App/Request/Handler/Next — every server/routing/middleware/
  // handler node, plus logic.functionCall's "Next"), plus Phase 7's dynamically synthesized
  // exec pins (Branch's true/false, Switch's case-<n>/default), represent sequential/
  // structural flow, not a value — every node that has one renders it as a white arrowhead,
  // like Unreal's exec pins, instead of a colored circle. Every other port (a named
  // parameter, "value", "result", etc.) carries an actual value and stays a colored circle.
  const execPinStyle = (connected: boolean) => ({
    width: 12,
    height: 12,
    background: connected ? "#f5f5f5" : "#f5f5f566",
    border: "none",
    borderRadius: 0,
    clipPath: "polygon(15% 0%, 100% 50%, 15% 100%)",
  });

  const handleStyle = (port: PortDefinition, connected: boolean) =>
    isExecPort(port) ? execPinStyle(connected) : pinStyle(connected, valuePinColor(port));

  const nodeData = (data ?? {}) as Record<string, unknown>;
  const effectiveInputs = computeEffectiveInputs(type, nodeData, definition);
  const effectiveOutputs = computeEffectiveOutputs(type, nodeData, definition);

  const literalKind = literalKindFor(type);
  const literals = (nodeData.literals as Record<string, unknown> | undefined) ?? {};
  const setLiteral = (portId: string, value: unknown) => {
    updateNodeData(id, "literals", { ...literals, [portId]: value });
  };

  const isVariadicBooleanNode = !!type && VARIADIC_BOOLEAN_TYPES.has(type);
  const extraInputIds = new Set(Array.isArray(nodeData.extraInputs) ? (nodeData.extraInputs as string[]) : []);

  return (
    <div
      className={[
        "min-w-[190px] overflow-hidden rounded-xl border shadow-lg shadow-black/50",
        hasError ? "border-red-500 ring-2 ring-red-500" : selected ? "border-sky-400 ring-2 ring-sky-400" : "border-black/60",
      ].join(" ")}
      style={{
        boxShadow: selected ? `0 0 0 1px ${accentHex}55, 0 8px 24px -4px ${accentHex}66` : undefined,
      }}
      title={hasError ? errors.map((e) => e.message).join("\n") : undefined}
    >
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${theme.headerClass}`}>
        <span className="flex h-5 w-5 items-center justify-center rounded bg-black/25">
          <CategoryIcon category={definition.category} className="h-3.5 w-3.5 text-white/90" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wide text-white">{definition.label}</span>
          {showSubtitle && <span className="truncate text-[10px] italic text-white/70">{summary}</span>}
        </div>
      </div>

      <div className="bg-[#242424]">
        {(effectiveInputs.length > 0 || effectiveOutputs.length > 0) && (
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex flex-col gap-1">
              {effectiveInputs.map((port) => {
                const connected = isInputConnected(port.id);
                const showLiteral = literalKind !== null && !isExecPort(port) && !connected;
                const isRemovableInput = isVariadicBooleanNode && extraInputIds.has(port.id);
                return (
                  // `relative` makes this row (not the whole node) the offset parent for its
                  // Handle — react-flow's default handle CSS centers vertically (`top: 50%`)
                  // on the nearest positioned ancestor, which without this is the node itself,
                  // collapsing every input handle onto the same point whenever a node has more
                  // than one (e.g. logic.functionCall's param-<N> pins) — a real bug caught by
                  // attempting to wire two distinct dynamic inputs and finding both edges
                  // terminate at one identical point.
                  <div key={port.id} className="relative flex items-center gap-1.5">
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={port.id}
                      style={handleStyle(port, connected)}
                    />
                    <span className="ml-2 text-[10px] text-neutral-300">{port.label}</span>
                    {showLiteral && literalKind === "number" && (
                      <input
                        type="number"
                        className="nodrag nopan w-10 rounded border border-neutral-700 bg-[#1f1f1f] px-1 py-0.5 text-[10px] text-neutral-100"
                        value={Number(literals[port.id] ?? 0)}
                        onChange={(e) => setLiteral(port.id, Number(e.target.value))}
                      />
                    )}
                    {showLiteral && literalKind === "boolean" && (
                      <input
                        type="checkbox"
                        className="nodrag nopan"
                        checked={Boolean(literals[port.id] ?? false)}
                        onChange={(e) => setLiteral(port.id, e.target.checked)}
                      />
                    )}
                    {showLiteral && literalKind === "text" && (
                      <input
                        type="text"
                        title="Any JS literal: a number, a quoted string, or true/false"
                        className="nodrag nopan w-16 rounded border border-neutral-700 bg-[#1f1f1f] px-1 py-0.5 text-[10px] text-neutral-100"
                        defaultValue={String(literals[port.id] ?? "0")}
                        onBlur={(e) => setLiteral(port.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    )}
                    {isRemovableInput && (
                      <button
                        type="button"
                        onClick={() => removeInputPin(id, port.id)}
                        title="Remove pin"
                        className="nodrag nopan flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-400 text-[9px] leading-none text-red-400 hover:bg-red-500 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {isVariadicBooleanNode && (
                <button
                  type="button"
                  onClick={() => addInputPin(id)}
                  className="nodrag nopan mt-0.5 self-start text-left text-[10px] text-sky-400 hover:text-sky-300"
                >
                  + Add pin
                </button>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {effectiveOutputs.map((port) => {
                const connected = isOutputConnected(port.id);
                return (
                  <div key={port.id} className="relative flex items-center gap-1.5">
                    <span className="mr-2 text-[10px] text-neutral-300">{port.label}</span>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={port.id}
                      style={handleStyle(port, connected)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showBodyChip && (
          <div className="mx-2.5 mb-2.5 rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-neutral-200">{summary}</div>
        )}
      </div>
    </div>
  );
}
