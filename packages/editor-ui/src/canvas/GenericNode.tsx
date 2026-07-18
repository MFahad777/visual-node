import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useMemo, useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { PortDefinition, VariableDeclaration } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { useFunctionGraphNodeDefinitions } from "./functionGraphNodeDefinitions.js";
import { useFunctionGraphEdgeContext } from "./functionGraphEdgeContext.js";
import { CATEGORY_THEME } from "./categoryTheme.js";
import { CategoryIcon } from "./CategoryIcon.js";
import { NodeCommentEditor } from "./NodeCommentEditor.js";
import { CommentIcon } from "./CommentIcon.js";
import { getVariableTypeColor } from "./variableTypeTheme.js";
import {
  computeEffectiveInputs,
  computeEffectiveOutputs,
  literalKindFor,
  staticLiteralPinIds,
  getPathExtractorParamCount,
  getCallbackArgs,
  VARIADIC_BOOLEAN_TYPES,
} from "./effectivePorts.js";
import { isExecPort } from "./execPorts.js";
import { Checkbox } from "../components/Checkbox.js";


function literalPreview(data: Record<string, unknown>, pinId: string): string {
  const literals = data.literals as Record<string, unknown> | undefined;
  const literal = literals?.[pinId];
  return typeof literal === "string" ? literal : "";
}

function summarize(
  type: string,
  data: Record<string, unknown>,
  variables: VariableDeclaration[],
  moduleVariables?: VariableDeclaration[],
  nodeId?: string,
  edges?: Array<{ target: string; targetHandle?: string | null }>,
): string | null {
  switch (type) {
    case "express.listen":
      return `port: ${data.port ?? 3000}`;
    case "express.route":
      return `${data.method ?? "GET"} ${data.path ?? "/"}`;
    case "handler.sendJson":
      return `status ${data.statusCode ?? 200}`;
    case "logic.function": {
      const name = String(data.name ?? "");
      return name.length > 0 ? `${name}(${data.params ?? ""})` : "(unnamed)";
    }
    case "logic.handlerFunction": {
      const name = String(data.name ?? "");
      return name.length > 0 ? `${name}(req, res, next)` : "(unnamed)";
    }
    case "logic.require":
      return `${data.variableName ?? "?"} = require(${JSON.stringify(data.path ?? "")})`;
    case "logic.functionCall": {
      const functionName = String(data.functionName ?? "");
      if (functionName.length === 0) return "(unnamed)";
      if (data.callKind === "sameFile") return `${functionName}(${data.params ?? ""})`;
      const variableName = String(data.variableName ?? "");
      return `${variableName}.${functionName}(${data.params ?? ""})`;
    }
    case "debug.consoleLog": {
      const expression = String(data.expression ?? "");
      return expression.length > 0 ? expression : "(empty)";
    }
    case "logic.pathExtractor": {
      if (edges && nodeId && edges.some((e) => e.target === nodeId && e.targetHandle === "path")) {
        return "(wired)";
      }
      const path = String(data.path ?? "");
      return path.length > 0 ? path : "(no path)";
    }
    case "logic.graphReturn": {
      const literals = data.literals as Record<string, unknown> | undefined;
      const literal = typeof literals?.value === "string" ? literals.value : "";
      return literal.length > 0 ? `return ${literal}` : "return (wired)";
    }
    // Phase 10: resolved live from the current store's `variables` list (not cached on the
    // node, which only ever stores the opaque `variableId`) so a rename in the Variables
    // panel is reflected on every referencing canvas node instantly.
    case "variable.get": {
      const variable = variables.find((v) => v.id === data.variableId)
        ?? moduleVariables?.find((v) => v.id === data.variableId);
      return variable ? `Get ${variable.name}` : "Get (missing variable)";
    }
    case "variable.set": {
      const variable = variables.find((v) => v.id === data.variableId)
        ?? moduleVariables?.find((v) => v.id === data.variableId);
      return variable ? `Set ${variable.name}` : "Set (missing variable)";
    }
    case "operators.equal":
      return data.strict === false ? "==" : "===";
    case "operators.notEqual":
      return data.strict === false ? "!=" : "!==";
    case "array.map":
      return "map(...)";
    case "array.filter":
      return "filter(...)";
    case "array.forEach":
      return "forEach(...)";
    case "array.flatMap":
      return "flatMap(...)";
    case "array.find":
      return "find(...)";
    case "array.findIndex":
      return "findIndex(...)";
    case "array.every":
      return "every(...)";
    case "array.some":
      return "some(...)";
    case "array.reduce":
      return `reduce(..., ${data.initialValue ?? "0"})`;
    case "array.push": {
      const literal = literalPreview(data, "value");
      return literal.length > 0 ? `.push(${literal})` : ".push(...)";
    }
    case "array.pop":
      return ".pop()";
    case "array.unshift": {
      const literal = literalPreview(data, "value");
      return literal.length > 0 ? `.unshift(${literal})` : ".unshift(...)";
    }
    case "array.shift":
      return ".shift()";
    case "array.includes": {
      const literal = literalPreview(data, "searchElement");
      return literal.length > 0 ? `.includes(${literal})` : ".includes(...)";
    }
    case "array.indexOf": {
      const literal = literalPreview(data, "searchElement");
      return literal.length > 0 ? `.indexOf(${literal})` : ".indexOf(...)";
    }
    case "logic.callback": {
      const argCount = Array.isArray(data.args) ? data.args.length : 0;
      return `callback(${argCount} arg${argCount === 1 ? "" : "s"})`;
    }
    case "logic.promise":
      return data.awaited === true ? "Awaited" : "Then/Catch";
    case "error.throw": {
      const expression = String(data.expression ?? "");
      const incoming = edges?.some((e) => e.target === nodeId && e.targetHandle === "value");
      return incoming ? "(wired)" : expression.length > 0 ? expression : "(empty)";
    }
    default:
      return null;
  }
}


export type GenericNodeProps = NodeProps;

function GenericNodeImpl({ id, type, data, selected }: GenericNodeProps) {
  const globalZoom = useFlowStore((s) => s.currentZoom);
  const scopedEdgeContext = useFunctionGraphEdgeContext();
  const zoom = scopedEdgeContext?.currentZoom ?? globalZoom;

  const globalDefinitions = useFlowStore((s) => s.nodeDefinitions);
  // Function-graph-only types (logic.graphEntry/graphReturn) are deliberately
  // absent from `globalDefinitions` (see functionGraphNodeDefinitions.ts) — when rendering
  // inside a Function node's blueprint sub-canvas, FunctionGraphTabView provides this context
  // with the scoped definitions those types actually need to render correctly.
  const functionGraphDefinitions = useFunctionGraphNodeDefinitions();
  const definition = type ? (functionGraphDefinitions?.[type] ?? globalDefinitions[type]) : undefined;
  const errors = useFlowStore((s) => s.validationErrorsByNodeId.get(id) || []);
  // Mirrors CustomEdge's scoped/global fallback (functionGraphEdgeContext.ts): inside a
  // Function node's blueprint sub-canvas, edges live in a local functionGraphStore with
  // `fgedge_*` ids that never match the global flowStore, so pin-connected checks below
  // would always miss and never glow without reading the scoped edges here instead.
  // A4: use useShallow to only trigger re-render if the edges array reference changes
  // (i.e. a real wiring change), not on every store update (like position drag).
  const globalEdges = useFlowStore(
    useShallow((s) => s.edges.filter((e) => e.source === id || e.target === id))
  );
  const edges = scopedEdgeContext?.edges ?? globalEdges;

  // Phase 10: same scoped/global fallback, for resolving a variable.get/variable.set
  // node's bound variableId to a display name in summarize() below.
  const globalVariables = useFlowStore((s) => s.variables);
  const variables = scopedEdgeContext?.variables ?? globalVariables;

  // Same scoped/global fallback for the Phase 7 dynamic-pin/literal-editing mutations below:
  // inside a Function node's blueprint sub-canvas these must hit the local functionGraphStore
  // instance (provided via context by FunctionGraphTabView), not the global flowStore, or the
  // edit would silently target a node id that doesn't exist there.
  const globalUpdateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const globalAddInputPin = useFlowStore((s) => s.addInputPin);
  const globalRemoveInputPin = useFlowStore((s) => s.removeInputPin);
  const globalAddSequencePin = useFlowStore((s) => s.addSequencePin);
  const globalRemoveSequencePin = useFlowStore((s) => s.removeSequencePin);
  const globalAddPathExtractorParam = useFlowStore((s) => s.addPathExtractorParam);
  const globalRemovePathExtractorParam = useFlowStore((s) => s.removePathExtractorParam);
  const globalAddCallbackArg = useFlowStore((s) => s.addCallbackArg);
  const globalRemoveCallbackArg = useFlowStore((s) => s.removeCallbackArg);
  // Same scoped/global fallback as the mutations above: inside a Function Graph tab, the
  // Comment "Expand" button must open the scoped functionGraphStore's own
  // expandedCommentField, or CommentExpandModal looks up a node id that only exists locally
  // and silently no-ops (the bug this fixes).
  const globalOpenCommentExpand = useFlowStore((s) => s.openCommentExpand);
  const openCommentExpand = scopedEdgeContext?.openCommentExpand ?? globalOpenCommentExpand;
  const updateNodeData = scopedEdgeContext?.updateNodeData ?? globalUpdateNodeConfig;
  const addInputPin = scopedEdgeContext?.addInputPin ?? globalAddInputPin;
  const removeInputPin = scopedEdgeContext?.removeInputPin ?? globalRemoveInputPin;
  const addSequencePin = scopedEdgeContext?.addSequencePin ?? globalAddSequencePin;
  const removeSequencePin = scopedEdgeContext?.removeSequencePin ?? globalRemoveSequencePin;
  const addPathExtractorParam = scopedEdgeContext?.addPathExtractorParam ?? globalAddPathExtractorParam;
  const removePathExtractorParam = scopedEdgeContext?.removePathExtractorParam ?? globalRemovePathExtractorParam;
  const addCallbackArg = scopedEdgeContext?.addCallbackArg ?? globalAddCallbackArg;
  const removeCallbackArg = scopedEdgeContext?.removeCallbackArg ?? globalRemoveCallbackArg;

  const [isEditingComment, setIsEditingComment] = useState(false);
  const bubbleRef = useRef<HTMLButtonElement>(null);

  if (!definition) {
    return (
      <div className="rounded border border-red-500 bg-neutral-900 px-3 py-2 text-xs text-red-400">
        Unknown node type: {type}
      </div>
    );
  }

  const hasError = errors.length > 0;
  const summary = summarize(
    type ?? "",
    (data ?? {}) as Record<string, unknown>,
    variables,
    scopedEdgeContext?.moduleVariables,
    id,
    edges,
  );
  const theme = CATEGORY_THEME[definition.category];
  // logic.promise gets a dedicated "Amber Gold" header/accent instead of the shared Logic
  // (violet) category color, per explicit user request — distinguishes it at a glance from
  // every other "logic"-category node (Function, Require, Export, Begin, etc.).
  const isPromiseNode = type === "logic.promise";
  const accentHex = isPromiseNode ? "#f5b400" : theme.accentHex;
  const headerClass = isPromiseNode ? "bg-gradient-to-b from-amber-400 to-amber-600" : theme.headerClass;

  // A variable.get's single "value" output and a variable.set's "value" input carry the
  // bound variable's own type, not a generic "logic"-category value — resolve it the same
  // way summarize() above resolves the bound variable's name, so a Get/Set node's pin (and,
  // via CustomEdge.tsx, its outgoing wire) render in that variable's color. A dangling
  // `data.variableId` (variable removed from the panel but the node left on canvas) falls
  // back to the ordinary category color rather than crashing.
  const boundVariable =
    type === "variable.get" || type === "variable.set"
      ? variables.find((v) => v.id === (data as Record<string, unknown> | undefined)?.variableId)
        ?? scopedEdgeContext?.moduleVariables?.find(
          (v) => v.id === (data as Record<string, unknown> | undefined)?.variableId,
        )
      : undefined;
  const valuePinColor = (port: PortDefinition): string =>
    boundVariable && port.id === "value" ? getVariableTypeColor(boundVariable.dataType) : accentHex;

  // variable.set's "Value" pin is a generic TEXT_LITERAL_TYPES entry (effectivePorts.ts) since
  // the bound variable could be any of Phase 10's 14 dataTypes — but once actually bound, the
  // variable's own dataType tells us exactly which widget is right: the same number/checkbox
  // controls every other numeric/boolean literal pin already gets, or (for every other type,
  // including "string") a plain text box holding the RAW value with no manual quoting —
  // `variable-set.node.ts`'s emit() wraps it into real JS source per dataType at compile time.
  // A dangling `variableId` (variable deleted, node left on canvas) falls back to the generic
  // raw-JS-source text box, same as before this existed.
  // Path Extractor's dynamic `param-<N>` pins (Phase 18) aren't part of the node type's
  // static shape, so `staticLiteralPinIds` (keyed only off `type`/`definition`) can't see
  // them — resolved here instead, the same way `variable.set`'s bound-variable-dependent
  // kind is resolved above.
  const pathExtractorParamCount =
    type === "logic.pathExtractor" ? getPathExtractorParamCount(data as Record<string, unknown> | undefined) : 0;
  const isPathExtractorParamPin = (portId: string) =>
    type === "logic.pathExtractor" && /^param-\d+$/.test(portId) && Number(portId.slice(6)) < pathExtractorParamCount;

  // `logic.function`'s dynamic `param-<N>` default-value pins (Phase 20) have the exact same
  // "not part of the static NodeDefinition shape" problem Path Extractor's params do — gated
  // here the same way, off the live parsed parameter count instead of a fixed pin list.
  const functionParamCount =
    type === "logic.function"
      ? String((data as Record<string, unknown> | undefined)?.params ?? "")
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0).length
      : 0;
  const isFunctionParamPin = (portId: string) =>
    type === "logic.function" && /^param-\d+$/.test(portId) && Number(portId.slice(6)) < functionParamCount;

  // `logic.callback`'s dynamic `arg-<id>` pins (Phase 21) have the same "not part of the
  // static NodeDefinition shape" problem Path Extractor's/Function's params do — a callback
  // arg can be any JS type, so it gets the same free-form raw-JS-text box, and (like every
  // other value pin here) only shows it when unwired — `resolveValuePin` already prefers the
  // wired value over the literal, so this is purely presentational, not a new precedence rule.
  const isCallbackArgPin = (portId: string) => type === "logic.callback" && /^arg-/.test(portId);

  const resolvedLiteralKindFor = (portId: string): "number" | "boolean" | "text" | null => {
    if (type === "variable.set" && portId === "value" && boundVariable) {
      if (boundVariable.dataType === "number") return "number";
      if (boundVariable.dataType === "boolean") return "boolean";
      return "text";
    }
    if (isPathExtractorParamPin(portId)) return "text";
    if (isFunctionParamPin(portId)) return "text";
    if (isCallbackArgPin(portId)) return "text";
    if (!literalKind || !type) return null;
    return staticLiteralPinIds(type, definition).includes(portId) ? literalKind : null;
  };

  const showSubtitle = !!summary;

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
  const comment = typeof nodeData.comment === "string" ? nodeData.comment : "";

  // A5: memoize effectiveInputs/Outputs computation, which is pure and keyed on type/data/definition.
  const effectiveInputs = useMemo(
    () => computeEffectiveInputs(type, nodeData, definition),
    [type, nodeData, definition]
  );
  const effectiveOutputs = useMemo(
    () => computeEffectiveOutputs(type, nodeData, definition),
    [type, nodeData, definition]
  );

  const literalKind = literalKindFor(type);
  const literals = (nodeData.literals as Record<string, unknown> | undefined) ?? {};
  const setLiteral = (portId: string, value: unknown) => {
    updateNodeData(id, "literals", { ...literals, [portId]: value });
  };

  const isVariadicBooleanNode = !!type && VARIADIC_BOOLEAN_TYPES.has(type);
  const extraInputIds = new Set(Array.isArray(nodeData.extraInputs) ? (nodeData.extraInputs as string[]) : []);
  const isSequenceNode = type === "controlFlow.sequence";
  const sequencePinIds = new Set(
    (Array.isArray(nodeData.pins) ? (nodeData.pins as Array<{ id: string }>) : []).map((p) => `then-${p.id}`),
  );
  const isPathExtractorNode = type === "logic.pathExtractor";
  const isCallbackNode = type === "logic.callback";
  const callbackArgIds = new Set(getCallbackArgs(nodeData).map((a) => `arg-${a.id}`));
  const scaleValue = Math.min(Math.max(1 / zoom, 0.5), 2);
  const dynamicTopOffset = -(36 + 10 * (scaleValue - 1));

  return (
    <div className="relative">
      {selected && (
        <button
          ref={bubbleRef}
          onClick={() => setIsEditingComment(true)}
          className="nodrag nopan absolute right-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-amber-400 bg-[#1f1f1f] text-amber-400 hover:bg-amber-400 hover:text-black"
          style={{ top: `${dynamicTopOffset}px` }}
          title="Add or edit comment"
        >
          <CommentIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        className={[
          "relative min-w-[190px] overflow-hidden rounded-xl border shadow-lg shadow-black/50",
          hasError ? "border-red-500 ring-2 ring-red-500" : selected ? "border-sky-400 ring-2 ring-sky-400" : "border-black/60",
        ].join(" ")}
        style={{
          boxShadow: selected ? `0 0 0 1px ${accentHex}55, 0 8px 24px -4px ${accentHex}66` : undefined,
        }}
        title={hasError ? errors.map((e) => e.message).join("\n") : undefined}
      >

      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${headerClass}`}>
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
                const portLiteralKind = resolvedLiteralKindFor(port.id);
                const showLiteral = portLiteralKind !== null && !isExecPort(port) && !connected;
                const isRemovableInput = isVariadicBooleanNode && extraInputIds.has(port.id);
                const isRemovableCallbackArg = isCallbackNode && callbackArgIds.has(port.id);
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
                    {showLiteral && portLiteralKind === "number" && (
                      <input
                        type="number"
                        className="nodrag nopan w-10 rounded border border-neutral-700 bg-[#1f1f1f] px-1 py-0.5 text-[10px] text-neutral-100"
                        value={Number(literals[port.id] ?? 0) || 0}
                        onChange={(e) => setLiteral(port.id, Number(e.target.value))}
                      />
                    )}
                    {showLiteral && portLiteralKind === "boolean" && (
                      <Checkbox
                        className="nodrag nopan"
                        checked={Boolean(literals[port.id] ?? false)}
                        onChange={(e) => setLiteral(port.id, e.target.checked)}
                      />
                    )}
                    {showLiteral && portLiteralKind === "text" && (
                      <input
                        type="text"
                        title={
                          type === "variable.set"
                            ? "The value to assign — plain text, no manual quoting needed even for a string variable"
                            : "Any JS literal: a number, a quoted string, or true/false"
                        }
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
                    {isRemovableCallbackArg && (
                      <button
                        type="button"
                        onClick={() => removeCallbackArg(id, port.id.replace(/^arg-/, ""))}
                        title="Remove arg"
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
              {isCallbackNode && (
                <button
                  type="button"
                  onClick={() => addCallbackArg(id)}
                  className="nodrag nopan mt-0.5 self-start text-left text-[10px] text-sky-400 hover:text-sky-300"
                >
                  + Add Arg
                </button>
              )}
              {isPathExtractorNode && (
                <div className="mt-0.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addPathExtractorParam(id)}
                    className="nodrag nopan text-left text-[10px] text-sky-400 hover:text-sky-300"
                  >
                    + Add Param
                  </button>
                  {pathExtractorParamCount > 0 && (
                    <button
                      type="button"
                      onClick={() => removePathExtractorParam(id)}
                      className="nodrag nopan text-left text-[10px] text-red-400 hover:text-red-300"
                    >
                      - Remove Param
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {effectiveOutputs.map((port) => {
                const connected = isOutputConnected(port.id);
                const isRemovableOutput = isSequenceNode && sequencePinIds.has(port.id);
                return (
                  <div key={port.id} className="relative flex items-center gap-1.5">
                    {isRemovableOutput && (
                      <button
                        type="button"
                        onClick={() => removeSequencePin(id, port.id.replace(/^then-/, ""))}
                        title="Remove pin"
                        className="nodrag nopan flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-400 text-[9px] leading-none text-red-400 hover:bg-red-500 hover:text-white"
                      >
                        ×
                      </button>
                    )}
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
              {isSequenceNode && (
                <button
                  type="button"
                  onClick={() => addSequencePin(id)}
                  className="nodrag nopan mt-0.5 self-end text-right text-[10px] text-sky-400 hover:text-sky-300"
                >
                  + Add pin
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    {comment.length > 0 && (
      <div
        onClick={() => setIsEditingComment(true)}
        title={comment}
        className="nodrag nopan absolute left-0 max-w-[150px] truncate cursor-pointer rounded-full border border-amber-400/40 bg-[#1f1f1f]/95 px-2 py-1 italic text-amber-300/90 transition-all duration-200"
        style={{
          top: `${dynamicTopOffset}px`,
          fontSize: `${Math.max(10, Math.min(20, 14 * scaleValue))}px`,
          padding: `${4 * scaleValue}px ${8 * scaleValue}px`,
        }}
      >
        {comment.replace(/\s+/g, " ").trim()}
      </div>
    )}

    {isEditingComment && (
      <NodeCommentEditor
        initialValue={comment}
        onSave={(text) => updateNodeData(id, "comment", text)}
        onClose={() => setIsEditingComment(false)}
        onExpand={(currentText) => {
          updateNodeData(id, "comment", currentText);
          setIsEditingComment(false);
          openCommentExpand(id);
        }}
      />
    )}
  </div>
);
}

// A1: wrap in React.memo with a custom comparator that only compares `id`, `type`, `selected`,
// and `data` (by reference). React Flow injects `xPos`, `yPos`, `dragging`, `zIndex`, `width`,
// `height`, and `positionAbsolute` as real values that change every drag frame; a default
// shallow-compare would (correctly, but unhelpfully) see them as "changed" and skip memoization.
// The custom comparator deliberately ignores these, since the component only destructures the
// four compared fields from NodeProps (see GenericNodeImpl above).
export const GenericNode = memo(GenericNodeImpl, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.type === nextProps.type &&
    prevProps.selected === nextProps.selected &&
    prevProps.data === nextProps.data
  );
});
