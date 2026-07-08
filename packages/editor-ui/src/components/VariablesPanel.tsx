import { useEffect, useState } from "react";
import type { VariableDataType, VariableDeclaration } from "@visual-node/core";
import { VARIABLE_DATA_TYPES, VARIABLE_TYPE_THEME, getVariableTypeColor } from "../canvas/variableTypeTheme.js";
import { ComplexDefaultValueEditor } from "./ComplexDefaultValueEditor.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const KEYWORDS: VariableDeclaration["keyword"][] = ["const", "let", "var"];

export interface VariablesPanelProps {
  variables: VariableDeclaration[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onSetKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  onSetDataType: (id: string, dataType: VariableDataType) => void;
  onSetDefault: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Pure, store-agnostic Variables panel (Phase 10) — parameterized entirely by props so the
 * same component renders identically whether wired to the main canvas's `flowStore`
 * (`NodeConfigPanel.tsx`) or a Function's own scoped `functionGraphStore`
 * (`FunctionGraphSidePanel.tsx`'s `FunctionDetailsPanel`). No Collapsible/Accordion component
 * exists anywhere else in this codebase, so the expand/collapse toggle below is a minimal
 * local `useState`, not a new dependency.
 */
export function VariablesPanel({
  variables,
  onAdd,
  onRename,
  onSetKeyword,
  onSetDataType,
  onSetDefault,
  onRemove,
}: VariablesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  const filteredVariables = variables.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-4 border-t border-black/60 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <span className="inline-block w-2.5 text-neutral-500">{collapsed ? "▸" : "▾"}</span>
          Variables
          <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] font-normal normal-case text-neutral-300">
            {variables.length}
          </span>
        </button>
        <button
          onClick={onAdd}
          className="rounded border border-neutral-600 px-2 py-0.5 text-[11px] text-neutral-300 hover:border-sky-500 hover:text-sky-400"
        >
          + Add
        </button>
      </div>
      {!collapsed && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search variables..."
          className="mb-2 w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500"
        />
      )}

      {!collapsed && (
        <div className="flex flex-col gap-2">
          {variables.length === 0 && <p className="text-[11px] text-neutral-500">No variables declared.</p>}
          {filteredVariables.length === 0 && variables.length > 0 && (
            <p className="text-[11px] text-neutral-500">No variables match "{search}".</p>
          )}
          {filteredVariables.map((variable) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              allVariables={variables}
              onRename={onRename}
              onSetKeyword={onSetKeyword}
              onSetDataType={onSetDataType}
              onSetDefault={onSetDefault}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariableRow({
  variable,
  allVariables,
  onRename,
  onSetKeyword,
  onSetDataType,
  onSetDefault,
  onRemove,
}: {
  variable: VariableDeclaration;
  allVariables: VariableDeclaration[];
  onRename: (id: string, name: string) => void;
  onSetKeyword: (id: string, keyword: VariableDeclaration["keyword"]) => void;
  onSetDataType: (id: string, dataType: VariableDataType) => void;
  onSetDefault: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Local draft so the input reflects every keystroke even while invalid — only a valid,
  // unique name is ever committed via `onRename`, same "only commit if valid" precedent as
  // FunctionGraphSidePanel.tsx's FunctionDetailsPanel Inputs-row rename, extended here with the
  // identifier-regex + uniqueness checks that panel doesn't itself need (params are
  // deduped implicitly by the caller; a user-authored variable name has no such guarantee).
  const [draftName, setDraftName] = useState(variable.name);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(variable.name);
    setNameError(null);
  }, [variable.name]);

  function handleNameChange(next: string) {
    setDraftName(next);
    if (!next) {
      setNameError("Name is required");
      return;
    }
    if (!IDENTIFIER_RE.test(next)) {
      setNameError("Must be a valid JS identifier");
      return;
    }
    if (allVariables.some((v) => v.id !== variable.id && v.name === next)) {
      setNameError("Name already in use");
      return;
    }
    setNameError(null);
    onRename(variable.id, next);
  }

  // `null`/`undefined` have no free-typed default — their "value" is the type itself, so
  // changing into one auto-fills the literal that matches, and changing back out of one
  // clears it rather than leaving a stale "null"/"undefined" string sitting in a now
  // string/number/etc. field. Any other type-to-type change leaves defaultValue alone: if
  // it's no longer valid for the new type, that's a compile-time validation error on the
  // core side, same as every other variable-shape mismatch in this codebase.
  function handleDataTypeChange(next: VariableDataType) {
    const prev = variable.dataType;
    onSetDataType(variable.id, next);
    if (next === "null") {
      onSetDefault(variable.id, "null");
    } else if (next === "undefined") {
      onSetDefault(variable.id, "undefined");
    } else if (prev === "null" || prev === "undefined") {
      onSetDefault(variable.id, "");
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-5 w-4 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <span className="text-xs">{collapsed ? "▸" : "▾"}</span>
        </button>
        {/* A dedicated grip handle, not the whole row: the row's own keyword/name/dataType/
            default controls are native <select>/<input> elements that swallow the initial
            mousedown themselves (opening/focusing instead of letting it bubble into a native
            HTML5 drag gesture on an ancestor) — making the entire row `draggable` meant a
            real drag only ever started if the user's grab happened to land on the one or two
            remaining pixels of bare padding. Found via a real repro: dragging from the row's
            center never fired even a `dragstart` event, while dragging from this handle does
            every time. */}
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("application/flowserver-variable", JSON.stringify({ variableId: variable.id }));
            event.dataTransfer.effectAllowed = "move";
          }}
          title="Drag onto the canvas to add a Get/Set node"
          className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-neutral-500 hover:text-neutral-300"
        >
          ⠿
        </span>
        <select
          value={variable.keyword}
          onChange={(e) => onSetKeyword(variable.id, e.target.value as VariableDeclaration["keyword"])}
          className="rounded border border-neutral-700 bg-[#1f1f1f] px-1 py-1 text-[11px] text-neutral-100"
        >
          {KEYWORDS.map((kw) => (
            <option key={kw} value={kw}>
              {kw}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={draftName}
          onChange={(e) => handleNameChange(e.target.value)}
          className={`w-full rounded border bg-[#1f1f1f] px-2 py-1 text-xs text-neutral-100 ${
            nameError ? "border-red-500" : "border-neutral-700"
          }`}
        />
        <button
          onClick={() => onRemove(variable.id)}
          title="Remove variable"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-600 text-xs text-red-400 hover:border-red-500 hover:bg-red-500/10"
        >
          ×
        </button>
      </div>
      {nameError && <span className="text-[10px] text-red-400">{nameError}</span>}
      {!collapsed && (
        <>
          <div className="flex items-center gap-1.5">
            {/* A plain <option> can't render a color swatch in most browsers, so the currently
                selected type's color is shown as a standalone dot next to the select instead —
                same idea as the reference Unreal Engine's colored type pills, just not inline
                inside the dropdown itself. */}
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/40"
              style={{ background: getVariableTypeColor(variable.dataType) }}
              title={VARIABLE_TYPE_THEME[variable.dataType]?.label}
            />
            <select
              value={variable.dataType}
              onChange={(e) => handleDataTypeChange(e.target.value as VariableDataType)}
              className="w-full rounded border border-neutral-700 bg-[#1f1f1f] px-1 py-1 text-[11px] text-neutral-100"
            >
              {VARIABLE_DATA_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {VARIABLE_TYPE_THEME[dt].label}
                </option>
              ))}
            </select>
          </div>
          <DefaultValueField
            dataType={variable.dataType}
            value={variable.defaultValue ?? ""}
            onChange={(value) => onSetDefault(variable.id, value)}
          />
        </>
      )}
    </div>
  );
}

/**
 * Renders the right input widget for a variable's default-value literal based on its
 * `dataType` — a plain text/number input for scalar types, a small monospace `<textarea>`
 * for the composite/collection types (object/array/map/set/weakset, where a raw JavaScript
 * literal is the natural authoring format — for objects, functions and methods are fully
 * supported, not just JSON-serializable data), a true/false/"no default" `<select>` for
 * booleans, and a fixed disabled control for `null`/`undefined` (there's nothing to type —
 * the type IS the value). No strict validation here beyond the input `type`/placeholder
 * hints: the actual literal is validated compile-time on the `packages/core` side, same
 * "codegen refuses to run on bad input, the UI doesn't duplicate that" philosophy already
 * used elsewhere in this codebase (see e.g. dangling variable references).
 */
function DefaultValueField({
  dataType,
  value,
  onChange,
}: {
  dataType: VariableDataType;
  value: string;
  onChange: (value: string) => void;
}) {
  const baseInputClass =
    "w-full rounded border border-neutral-700 bg-[#1f1f1f] px-2 py-1 font-mono text-[11px] text-neutral-100 placeholder:text-neutral-600";

  if (dataType === "null" || dataType === "undefined") {
    return (
      <input
        type="text"
        value={dataType}
        disabled
        readOnly
        className={`${baseInputClass} cursor-not-allowed opacity-60`}
      />
    );
  }

  if (dataType === "boolean") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={baseInputClass}>
        <option value="">no default</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (dataType === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="no default"
        className={baseInputClass}
      />
    );
  }

  if (dataType === "object" || dataType === "array" || dataType === "map" || dataType === "set" || dataType === "weakset") {
    return <ComplexDefaultValueEditor dataType={dataType} value={value} onChange={onChange} />;
  }

  const placeholder =
    dataType === "bigint"
      ? "e.g. 42"
      : dataType === "symbol"
        ? "description (optional)"
        : dataType === "buffer"
          ? "UTF-8 text"
          : dataType === "url"
            ? "https://example.com"
            : dataType === "function"
              ? "e.g. (x) => x * 2, or myFunction"
              : "no default";

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={baseInputClass}
    />
  );
}
