import { useEffect, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { ConfigField, VariableDeclaration } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { useEditorTabsStore } from "../store/editorTabsStore.js";
import { getCallbackArgs } from "../canvas/effectivePorts.js";
import { RequiredModulesPanel } from "./RequiredModulesPanel.js";
import { SwitchCasesConfig } from "./SwitchCasesConfig.js";
import { VariablesPanel } from "./VariablesPanel.js";
import { useResize } from "../hooks/useResize.js";
import { ResizeHandle } from "./ResizeHandle.js";
import { LazyJsonCodeField } from "./LazyJsonCodeField.js";
import { LazyJsCodeField } from "./LazyJsCodeField.js";


function ConfigFieldInput({
  field,
  value,
  onChange,
  onExpand,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  onExpand?: () => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={Number(value ?? field.default ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value ?? field.default ?? false)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "select":
      return (
        <select
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(value ?? field.default ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "code":
      if (typeof field.default === "string") {
        return <LazyJsCodeField value={value} onChange={onChange} onExpand={onExpand} />;
      }
      return <LazyJsonCodeField field={field} value={value} onChange={onChange} onExpand={onExpand} />;
    default:
      return null;
  }
}

/**
 * `logic.functionCall`'s configSchema (in packages/core) is generic text fields for
 * callKind/requirePath/variableName/functionName/params/resultVariable, but all but the
 * last are fixed at node-creation time — editing them would desync the node from the real
 * function it was resolved from. This renders a read-only call signature instead (the
 * `variableName.functionName(...)` shape for a Require-based call, or a bare
 * `functionName(...)` when `callKind === "sameFile"`), plus the one field that *is*
 * editable (resultVariable), plus one row per parsed parameter: either a read-only "wired
 * from" indicator (when a param-<N> pin has an incoming edge) or an editable
 * raw-JS-expression fallback (arg-<N>), since the core configSchema has no field for those
 * at all — the parameter count varies per instance, not per node type.
 */
function FunctionCallConfig({
  node,
  edges,
  nodes,
  updateNodeConfig,
}: {
  node: Node;
  edges: Edge[];
  nodes: Node[];
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
}) {
  const isSameFile = node.data?.callKind === "sameFile";
  const variableName = String(node.data?.variableName ?? "");
  const functionName = String(node.data?.functionName ?? "");
  const paramsRaw = String(node.data?.params ?? "");
  const params = paramsRaw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-3 rounded bg-black/40 px-2 py-1.5 font-mono text-xs text-neutral-200">
        {isSameFile ? (
          <>
            {functionName}({paramsRaw})
          </>
        ) : (
          <>
            {variableName}.{functionName}({paramsRaw})
          </>
        )}
      </div>
      <p className="text-[11px] text-neutral-400">
        {isSameFile ? "Calls a function defined in this same file." : "Calls an exported function from a required module."}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Result Variable Name</span>
        <span className="text-[11px] text-neutral-400">
          Must be a valid, unique JS identifier. Other nodes reference this call's return value by this name.
        </span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.resultVariable ?? "")}
          onChange={(e) => updateNodeConfig(node.id, "resultVariable", e.target.value)}
        />
      </label>

      {params.map((paramName, i) => {
        const incomingEdge = edges.find((e) => e.target === node.id && e.targetHandle === `param-${i}`);
        if (incomingEdge) {
          const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
          const sourceLabel =
            sourceNode && sourceNode.type === "logic.functionCall"
              ? String(sourceNode.data?.resultVariable ?? sourceNode.id)
              : (sourceNode?.id ?? incomingEdge.source);
          return (
            <label key={i} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-400">{paramName}</span>
              <span className="text-[11px] text-neutral-400">← wired from "{sourceLabel}"</span>
            </label>
          );
        }
        return (
          <label key={i} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">{paramName}</span>
            <input
              type="text"
              className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
              value={String(node.data?.[`arg-${i}`] ?? "")}
              onChange={(e) => updateNodeConfig(node.id, `arg-${i}`, e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

/**
 * `logic.callback`'s dynamic `arg-<id>` pins (Phase 21) have no core `configSchema` entry —
 * the arg count varies per instance, not per node type, same reason `FunctionCallConfig`
 * above hand-rolls its per-param rows instead of using the generic form. Each arg row shows
 * either a disabled "Wired" field (the connected node's value wins at codegen time — see
 * `resolveValuePin`, which always prefers the wire over `data.literals`) or an editable text
 * field bound to `data.literals["arg-<id>"]`, the exact same storage `GenericNode.tsx`'s
 * on-canvas inline literal box reads/writes, so editing here and on the node face stay in
 * sync with no extra wiring.
 */
function CallbackConfig({
  node,
  edges,
  updateNodeConfig,
}: {
  node: Node;
  edges: Edge[];
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
}) {
  const args = getCallbackArgs(node.data as Record<string, unknown> | undefined);
  const literals = (node.data?.literals as Record<string, unknown> | undefined) ?? {};

  const setLiteral = (pinId: string, value: string) => {
    updateNodeConfig(node.id, "literals", { ...literals, [pinId]: value });
  };

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
                  onChange={(e) => setLiteral(pinId, e.target.value)}
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

/**
 * `logic.require`'s core `configSchema` is generic text/select fields (sourceType, path,
 * variableName, version), but the meaning of `path` and whether `version` applies both
 * depend on `sourceType` — the generic configSchema.map() renderer has no concept of
 * conditional fields, so this hand-rolled panel mirrors FunctionNodeConfig's Code/
 * Blueprint toggle pattern for a Local/npm toggle instead.
 */
function RequireNodeConfig({
  node,
  updateNodeConfig,
}: {
  node: Node;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
}) {
  const sourceType = node.data?.sourceType === "npm" ? "npm" : "local";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Source</span>
        <div className="flex overflow-hidden rounded border border-neutral-700">
          <button
            type="button"
            onClick={() => updateNodeConfig(node.id, "sourceType", "local")}
            className={`flex-1 px-2 py-1 text-xs ${sourceType === "local" ? "bg-sky-600 text-white" : "bg-[#1f1f1f] text-neutral-300 hover:bg-neutral-700"}`}
          >
            Local
          </button>
          <button
            type="button"
            onClick={() => updateNodeConfig(node.id, "sourceType", "npm")}
            className={`flex-1 px-2 py-1 text-xs ${sourceType === "npm" ? "bg-sky-600 text-white" : "bg-[#1f1f1f] text-neutral-300 hover:bg-neutral-700"}`}
          >
            npm
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">{sourceType === "npm" ? "Package Name" : "Path"}</span>
        <span className="text-[11px] text-neutral-400">
          {sourceType === "npm"
            ? 'The npm package name, e.g. "lodash" or a scoped package like "@org/pkg".'
            : "Relative path to the target .blueprint file, e.g. \"./helpers/date-utils\"."}
        </span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.path ?? "")}
          onChange={(e) => updateNodeConfig(node.id, "path", e.target.value)}
        />
      </label>

      {sourceType === "npm" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-400">Version</span>
          <span className="text-[11px] text-neutral-400">leave blank for unpinned</span>
          <input
            type="text"
            placeholder="^1.7.0"
            className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
            value={String(node.data?.version ?? "")}
            onChange={(e) => updateNodeConfig(node.id, "version", e.target.value)}
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Variable Name</span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.variableName ?? "")}
          onChange={(e) => updateNodeConfig(node.id, "variableName", e.target.value)}
        />
      </label>
    </div>
  );
}

/**
 * `logic.function` has a `mode` toggle deciding whether its body comes from hand-typed
 * code or a compiled blueprint graph — this renders `name`/`params` normally, a segmented
 * Code/Blueprint toggle, and then EITHER the code editor (reusing JsCodeField, same as the
 * generic path, just wired here explicitly) OR an "Open Blueprint Graph" button + a compact
 * summary, mirroring FunctionCallConfig's precedent of a fully hand-rolled panel instead of
 * the generic configSchema-driven form.
 */
function FunctionNodeConfig({
  node,
  updateNodeConfig,
  openCodeExpand,
  onOpenBlueprintGraph,
}: {
  node: Node;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  openCodeExpand: (nodeId: string, fieldKey: string, fieldLabel: string) => void;
  onOpenBlueprintGraph: () => void;
}) {
  const mode = node.data?.mode === "blueprint" ? "blueprint" : "code";
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
          "Switching to Blueprint mode won't preserve your existing Function Body code. Continue?",
        );
        if (!confirmed) return;
      }
      updateNodeConfig(node.id, "mode", "blueprint");
      return;
    }
    // Blueprint -> Code: best-effort "freeze" the currently-compiled body into the `body`
    // field instead of clearing it, since sync is one-directional (graph -> code, never
    // back) — losing the compiled result on a mode switch would be a silent data-loss trap.
    updateNodeConfig(node.id, "mode", "code");
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Function Name</span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.name ?? "")}
          onChange={(e) => updateNodeConfig(node.id, "name", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Parameters</span>
        <span className="text-[11px] text-neutral-400">Comma-separated parameter names, e.g. "date, format".</span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.params ?? "")}
          onChange={(e) => updateNodeConfig(node.id, "params", e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(node.data?.isAsync ?? false)}
          onChange={(e) => updateNodeConfig(node.id, "isAsync", e.target.checked)}
        />
        <span className="text-xs font-medium text-neutral-400">Async Function</span>
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
            <span className="text-xs font-medium text-neutral-400">Function Body</span>
            <span className="text-[11px] text-neutral-400">
              Available: the parameter names declared above. Use `return` to produce a value.
            </span>
            <LazyJsCodeField
              value={node.data?.body}
              onChange={(value) => updateNodeConfig(node.id, "body", value)}
              onExpand={() => openCodeExpand(node.id, "body", "Function Body")}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">npm Dependencies</span>
            <span className="text-[11px] text-neutral-400">
              Comma-separated package names this function's code depends on, e.g. "lodash, dayjs".
            </span>
            <input
              type="text"
              className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
              value={String(node.data?.npmDependencies ?? "")}
              onChange={(e) => updateNodeConfig(node.id, "npmDependencies", e.target.value)}
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
            onClick={onOpenBlueprintGraph}
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
 * `logic.handlerFunction` mirrors `logic.function`'s Code/Blueprint dual-mode UI exactly
 * (see `FunctionNodeConfig` above), with two differences: its `req, res, next` parameters
 * are fixed by the node type (Express's handler signature is invariant) and rendered as a
 * read-only row instead of an editable Parameters field, and the checkbox reads "Async
 * Handler" instead of "Async Function" to match its `configSchema` label.
 */
function HandlerFunctionNodeConfig({
  node,
  updateNodeConfig,
  openCodeExpand,
  onOpenBlueprintGraph,
}: {
  node: Node;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  openCodeExpand: (nodeId: string, fieldKey: string, fieldLabel: string) => void;
  onOpenBlueprintGraph: () => void;
}) {
  const mode = node.data?.mode === "blueprint" ? "blueprint" : "code";
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
          "Switching to Blueprint mode won't preserve your existing Function Body code. Continue?",
        );
        if (!confirmed) return;
      }
      updateNodeConfig(node.id, "mode", "blueprint");
      return;
    }
    updateNodeConfig(node.id, "mode", "code");
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Function Name</span>
        <input
          type="text"
          className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
          value={String(node.data?.name ?? "")}
          onChange={(e) => updateNodeConfig(node.id, "name", e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Parameters</span>
        <div className="rounded border border-neutral-800 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-neutral-400">
          req, res, next
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(node.data?.isAsync ?? false)}
          onChange={(e) => updateNodeConfig(node.id, "isAsync", e.target.checked)}
        />
        <span className="text-xs font-medium text-neutral-400">Async Handler</span>
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
            <span className="text-xs font-medium text-neutral-400">Function Body</span>
            <span className="text-[11px] text-neutral-400">
              Available: req, res, next. Call res.json(...) or res.send(...) to respond, next() to continue.
            </span>
            <LazyJsCodeField
              value={node.data?.body}
              onChange={(value) => updateNodeConfig(node.id, "body", value)}
              onExpand={() => openCodeExpand(node.id, "body", "Function Body")}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">npm Dependencies</span>
            <span className="text-[11px] text-neutral-400">
              Comma-separated package names this handler's code depends on, e.g. "lodash, dayjs".
            </span>
            <input
              type="text"
              className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100"
              value={String(node.data?.npmDependencies ?? "")}
              onChange={(e) => updateNodeConfig(node.id, "npmDependencies", e.target.value)}
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
            onClick={onOpenBlueprintGraph}
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
 * `debug.consoleLog`'s "Expression" field only takes effect when its "value" input pin is
 * unwired — once wired, the wired node's value is what actually gets logged (see
 * `console-log.node.ts`'s `emit()`), and the typed expression is ignored. The generic
 * `configSchema.map()` renderer has no concept of "disable this field based on pin
 * wiring", so this mirrors `RequireNodeConfig`'s precedent of a small hand-rolled panel.
 */
function ConsoleLogConfig({
  node,
  edges,
  updateNodeConfig,
  openCodeExpand,
}: {
  node: Node;
  edges: Edge[];
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  openCodeExpand: (nodeId: string, fieldKey: string, fieldLabel: string) => void;
}) {
  const isValueWired = edges.some((e) => e.target === node.id && e.targetHandle === "value");

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Expression</span>
        <span className="text-[11px] text-neutral-400">
          {isValueWired
            ? "The Value pin is wired — its value is logged instead of this expression."
            : "Available: req, res. Any JS expression(s), comma-separated for multiple console.log arguments, e.g. req.method, req.path."}
        </span>
        {isValueWired ? (
          <div className="rounded border border-neutral-800 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-neutral-400">
            {String(node.data?.expression ?? '""')}
          </div>
        ) : (
          <LazyJsCodeField
            value={node.data?.expression}
            onChange={(value) => updateNodeConfig(node.id, "expression", value)}
            onExpand={() => openCodeExpand(node.id, "expression", "Expression")}
          />
        )}
      </label>
    </div>
  );
}

/**
 * `variable.get`/`variable.set`'s only real "configuration" is which variable they're bound
 * to (`data.variableId`, set at drop time — see `VariableDropMenu.tsx` — and never edited
 * here) — this renders a read-only summary instead of the generic `configSchema`-driven
 * fields, plus a clear warning for a dangling reference (the variable was deleted via the
 * Variables panel while this node still pointed at it — `removeVariable` deliberately
 * doesn't cascade-delete/edit referencing nodes, see flowStore.ts).
 */
function VariableBindingInfo({ node, variables }: { node: Node; variables: VariableDeclaration[] }) {
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

export function NodeConfigPanel() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const nodeDefinitions = useFlowStore((s) => s.nodeDefinitions);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const deleteSelectedNode = useFlowStore((s) => s.deleteSelectedNode);
  const edges = useFlowStore((s) => s.edges);
  const nodes = useFlowStore((s) => s.nodes);
  const openCodeExpand = useFlowStore((s) => s.openCodeExpand);
  const openFunctionGraphTab = useEditorTabsStore((s) => s.openFunctionGraphTab);
  const addSwitchCasePin = useFlowStore((s) => s.addSwitchCasePin);
  const removeSwitchCasePin = useFlowStore((s) => s.removeSwitchCasePin);
  const updateSwitchCaseValue = useFlowStore((s) => s.updateSwitchCaseValue);
  const variables = useFlowStore((s) => s.variables);
  const addVariable = useFlowStore((s) => s.addVariable);
  const renameVariable = useFlowStore((s) => s.renameVariable);
  const setVariableKeyword = useFlowStore((s) => s.setVariableKeyword);
  const setVariableDataType = useFlowStore((s) => s.setVariableDataType);
  const setVariableDefault = useFlowStore((s) => s.setVariableDefault);
  const removeVariable = useFlowStore((s) => s.removeVariable);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const { size: width, onMouseDown } = useResize({ initial: 320, min: 240, max: 600, axis: "x", invert: true });

  // No file open means no Flow to hold these variables at all — showing an interactive
  // "+ Add" here would let a user declare variables that have nowhere to be saved.
  const variablesPanel = currentFilePath ? (
    <VariablesPanel
      variables={variables}
      onAdd={addVariable}
      onRename={renameVariable}
      onSetKeyword={setVariableKeyword}
      onSetDataType={setVariableDataType}
      onSetDefault={setVariableDefault}
      onRemove={removeVariable}
    />
  ) : null;

  if (!selectedNodeId || !node) {
    return (
      <div className="flex h-full shrink-0" style={{ width }}>
        <ResizeHandle axis="x" onMouseDown={onMouseDown} />
        <div className="h-full min-w-0 flex-1 overflow-y-auto border-l border-black/60 bg-[#1f1f1f] p-3">
          <p className="text-xs text-neutral-400">Select a node to configure it.</p>
          <RequiredModulesPanel />
          {variablesPanel}
        </div>
      </div>
    );
  }

  const definition = node.type ? nodeDefinitions[node.type] : undefined;
  if (!definition) {
    return (
      <div className="flex h-full shrink-0" style={{ width }}>
        <ResizeHandle axis="x" onMouseDown={onMouseDown} />
        <div className="h-full min-w-0 flex-1 border-l border-black/60 bg-[#1f1f1f] p-3 text-xs text-red-400">
          Unknown node type: {node.type}
          {variablesPanel}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full shrink-0" style={{ width }}>
      <ResizeHandle axis="x" onMouseDown={onMouseDown} />
      <div className="h-full min-w-0 flex-1 overflow-y-auto border-l border-black/60 bg-[#1f1f1f] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">{definition.label}</h2>
        <button
          onClick={deleteSelectedNode}
          className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
          title="Delete node"
        >
          Delete
        </button>
      </div>
      <p className="mb-3 text-[11px] text-neutral-400">{definition.description}</p>

      {node.type === "logic.functionCall" ? (
        <FunctionCallConfig node={node} edges={edges} nodes={nodes} updateNodeConfig={updateNodeConfig} />
      ) : node.type === "logic.function" ? (
        <FunctionNodeConfig
          node={node}
          updateNodeConfig={updateNodeConfig}
          openCodeExpand={openCodeExpand}
          onOpenBlueprintGraph={() => openFunctionGraphTab(node)}
        />
      ) : node.type === "logic.handlerFunction" ? (
        <HandlerFunctionNodeConfig
          node={node}
          updateNodeConfig={updateNodeConfig}
          openCodeExpand={openCodeExpand}
          onOpenBlueprintGraph={() => openFunctionGraphTab(node)}
        />
      ) : node.type === "logic.require" ? (
        <RequireNodeConfig node={node} updateNodeConfig={updateNodeConfig} />
      ) : node.type === "logic.callback" ? (
        <CallbackConfig node={node} edges={edges} updateNodeConfig={updateNodeConfig} />
      ) : node.type === "debug.consoleLog" ? (
        <ConsoleLogConfig node={node} edges={edges} updateNodeConfig={updateNodeConfig} openCodeExpand={openCodeExpand} />
      ) : node.type === "controlFlow.switch" ? (
        <SwitchCasesConfig
          node={node}
          onAddCase={addSwitchCasePin}
          onRemoveCase={removeSwitchCasePin}
          onUpdateCaseValue={updateSwitchCaseValue}
        />
      ) : node.type === "variable.get" || node.type === "variable.set" ? (
        <VariableBindingInfo node={node} variables={variables} />
      ) : definition.configSchema.length === 0 ? (
        <p className="text-xs text-neutral-400">This node has no configuration.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {definition.configSchema.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-400">{field.label}</span>
              {field.hint && <span className="text-[11px] text-neutral-400">{field.hint}</span>}
              <ConfigFieldInput
                // Forces CodeMirror-backed fields to fully remount on node
                // switch — without this, @uiw/react-codemirror can retain
                // the previous node's in-progress edit in its internal
                // EditorView and merge it with the next node's typed input.
                key={`${node.id}:${field.key}`}
                field={field}
                value={node.data?.[field.key]}
                onChange={(value) => updateNodeConfig(node.id, field.key, value)}
                onExpand={
                  field.type === "code" ? () => openCodeExpand(node.id, field.key, field.label) : undefined
                }
              />
            </label>
          ))}
        </div>
      )}
      {variablesPanel}
      </div>
    </div>
  );
}
