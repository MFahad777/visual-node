import { useEffect, useMemo, useRef, useState } from "react";
import type { XYPosition } from "@xyflow/react";
import type { NodeDefinition } from "@visual-node/core";
import * as api from "../api/client.js";
import { useFlowStore } from "../store/flowStore.js";
import { resolveRequiredFunctions, type ResolvedFunction } from "../lib/resolveRequiredFunctions.js";
import { defaultLiteralsFor } from "../canvas/effectivePorts.js";

export interface FunctionGraphNodePickerProps {
  screenX: number;
  screenY: number;
  flowPosition: XYPosition;
  /** Current local sub-graph nodes, used for best-effort resultVariable collision avoidance
   * and (via its `logic.graphEntry` node) the live, possibly-unsaved parameter list of the
   * function currently being edited — see `sameFileEntries` below. */
  localNodes: Array<{ type?: string; data?: Record<string, unknown> }>;
  onAddNode: (type: string, position: XYPosition, data: Record<string, unknown>) => void;
  onClose: () => void;
}

interface SameFileFunctionEntry {
  nodeId: string;
  functionName: string;
  params: string;
  isSelf: boolean;
}

const MENU_WIDTH = 260;
const MENU_MAX_HEIGHT = 420;

function collectExistingResultVariables(nodes: Array<{ type?: string; data?: Record<string, unknown> }>): Set<string> {
  const names = new Set<string>();
  for (const n of nodes) {
    if (n.type === "logic.functionCall") names.add(String(n.data?.resultVariable ?? "").trim());
  }
  names.delete("");
  return names;
}

function generateUniqueResultVariable(functionName: string, nodes: Array<{ type?: string; data?: Record<string, unknown> }>): string {
  const existing = collectExistingResultVariables(nodes);
  const base = `${functionName}Result`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}${suffix}`)) suffix++;
  return `${base}${suffix}`;
}

// `logic.graphEntry` is managed exclusively via the Details panel's Inputs section in
// `FunctionGraphModal.tsx` (at most one per graph) — never offered here.
// `logic.functionCall` is excluded too: it's only ever added pre-filled from a specific
// resolved function — either Require'd ("Function Calls" section below) or declared in
// this same file ("Functions in This File" section below) — never blank.
// `variable.get`/`variable.set` are excluded for the same reason as `logic.functionCall`:
// they need a bound `data.variableId`, only ever set via dragging a row out of the Details
// panel's Variables section, never via this generic catalog. They still need to be present
// in `FUNCTION_GRAPH_NODE_DEFINITIONS` itself (see function-graph-nodes.ts in core) so
// `GenericNode` can resolve their ports when rendering an already-placed instance.
// `logic.graphReturn` ("Return") is NOT in this set — unlike Entry, it's an ordinary,
// freely-multipliable addable node (like Branch/Switch/Console Log), wired directly on
// canvas via its own "In"/"Value" pins rather than managed through the Details panel.
const PANEL_MANAGED_TYPES = new Set([
  "logic.graphEntry",
  "logic.functionCall",
  "variable.get",
  "variable.set",
]);

/**
 * Right-click context menu for the function-graph sub-canvas — a much smaller, restricted
 * counterpart to `canvas/NodePickerMenu.tsx` (that file's click-outside/Escape pattern and
 * viewport-clamped positioning are reused here almost verbatim). Generically offers every
 * node type from `FUNCTION_GRAPH_NODE_DEFINITIONS` (fetched via `?scope=function-graph`)
 * except `PANEL_MANAGED_TYPES` above, plus two resolved-Function-Call sections: "Function
 * Calls" (Require-based, one per exported function reachable from the outer flow's Require
 * nodes — same resolution `NodePickerMenu.tsx` uses on the top-level canvas) and "Functions
 * in This File" (same-file, one per sibling `logic.function` node declared at the outer
 * flow's top level, including the function whose graph is currently open — selecting that
 * one wires up a recursive self-call).
 */
export function FunctionGraphNodePicker({
  screenX,
  screenY,
  flowPosition,
  localNodes,
  onAddNode,
  onClose,
}: FunctionGraphNodePickerProps) {
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const requireNodes = useFlowStore((s) => s.nodes.filter((n) => n.type === "logic.require"));
  const siblingFunctionNodes = useFlowStore((s) => s.nodes.filter((n) => n.type === "logic.function"));
  const currentFunctionNodeId = useFlowStore((s) => s.openFunctionGraphNodeId);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [definitions, setDefinitions] = useState<NodeDefinition[]>([]);
  const [functionCallEntries, setFunctionCallEntries] = useState<ResolvedFunction[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.fetchNodeRegistry("function-graph").then((defs) => {
      if (!cancelled) setDefinitions(defs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const requireSignature = requireNodes
    .map((n) => `${n.id}:${n.data?.path}:${n.data?.variableName}`)
    .join("|");

  useEffect(() => {
    if (requireNodes.length === 0 || !currentFilePath) {
      setFunctionCallEntries([]);
      return;
    }
    let cancelled = false;
    resolveRequiredFunctions(currentFilePath, requireNodes).then((results) => {
      if (!cancelled) setFunctionCallEntries(results.flatMap((mod) => mod.functions));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilePath, requireSignature]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose]);

  const addableDefinitions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return definitions.filter(
      (d) =>
        !PANEL_MANAGED_TYPES.has(d.type) &&
        (d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
    );
  }, [definitions, query]);

  const filteredFunctionCallEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return functionCallEntries.filter((fn) => {
      const label = `${fn.functionName}(${fn.params})`;
      const description = `Call via ${fn.variableName} (${fn.requirePath})`;
      return label.toLowerCase().includes(q) || description.toLowerCase().includes(q);
    });
  }, [functionCallEntries, query]);

  // The self entry's params must reflect the LIVE (possibly-unsaved) parameter list from the
  // local sub-graph's own `logic.graphEntry` node, not the outer flow node's `data.params` —
  // the outer node only gets the current param list written back on "Save & Close" (Phase 6),
  // so a param just added/renamed in the Details panel would otherwise be invisible here until
  // after a save. Every other (non-self) sibling function isn't concurrently being edited in
  // this modal session, so its own outer-flow node's `data.params` is already authoritative.
  const sameFileEntries = useMemo((): SameFileFunctionEntry[] => {
    const graphEntryNode = localNodes.find((n) => n.type === "logic.graphEntry");
    const liveSelfParams = Array.isArray(graphEntryNode?.data?.params) ? (graphEntryNode!.data!.params as string[]) : [];
    return siblingFunctionNodes
      .map((n): SameFileFunctionEntry => {
        const isSelf = n.id === currentFunctionNodeId;
        return {
          nodeId: n.id,
          functionName: String(n.data?.name ?? "").trim(),
          params: isSelf ? liveSelfParams.join(", ") : String(n.data?.params ?? ""),
          isSelf,
        };
      })
      .filter((entry) => entry.functionName.length > 0);
  }, [siblingFunctionNodes, currentFunctionNodeId, localNodes]);

  const filteredSameFileEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sameFileEntries.filter((fn) => {
      const label = `${fn.functionName}(${fn.params})`;
      return label.toLowerCase().includes(q);
    });
  }, [sameFileEntries, query]);

  const left = Math.max(8, Math.min(screenX, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(screenY, window.innerHeight - MENU_MAX_HEIGHT - 8));

  function handleAddNode(def: NodeDefinition) {
    const data: Record<string, unknown> = Object.fromEntries(def.configSchema.map((f) => [f.key, f.default]));
    const literals = defaultLiteralsFor(def.type, def);
    if (literals) data.literals = literals;
    onAddNode(def.type, flowPosition, data);
    onClose();
  }

  function handleAddFunctionCall(entry: ResolvedFunction) {
    // Best-effort uniqueness check against the local sub-graph's own Function Call nodes
    // only — not required for correctness since a real collision still surfaces as a
    // compile error once the project is compiled, which the user can fix by renaming.
    const data = {
      callKind: "require",
      requirePath: entry.requirePath,
      variableName: entry.variableName,
      functionName: entry.functionName,
      params: entry.params,
      resultVariable: generateUniqueResultVariable(entry.functionName, localNodes),
    };
    onAddNode("logic.functionCall", flowPosition, data);
    onClose();
  }

  function handleAddSameFileFunctionCall(entry: SameFileFunctionEntry) {
    const data = {
      callKind: "sameFile",
      requirePath: "",
      variableName: "",
      functionName: entry.functionName,
      params: entry.params,
      resultVariable: generateUniqueResultVariable(entry.functionName, localNodes),
    };
    onAddNode("logic.functionCall", flowPosition, data);
    onClose();
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", left, top, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
      className="z-50 flex flex-col overflow-hidden rounded-lg border border-black/60 bg-[#1f1f1f] shadow-2xl shadow-black/60"
    >
      <div className="border-b border-black/60 p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1 text-xs text-neutral-100 outline-none focus:border-sky-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1.5">
          {addableDefinitions.map((def) => (
            <PickerCard
              key={def.type}
              label={def.label}
              description={def.description}
              onClick={() => handleAddNode(def)}
            />
          ))}
        </div>

        {filteredSameFileEntries.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Functions in This File</h3>
            <div className="flex flex-col gap-1.5">
              {filteredSameFileEntries.map((fn) => (
                <PickerCard
                  key={fn.nodeId}
                  label={fn.isSelf ? `${fn.functionName}(${fn.params}) (recursive)` : `${fn.functionName}(${fn.params})`}
                  description={fn.isSelf ? "Call this function itself" : "Call a function defined in this file"}
                  onClick={() => handleAddSameFileFunctionCall(fn)}
                />
              ))}
            </div>
          </div>
        )}

        {filteredFunctionCallEntries.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Function Calls</h3>
            <div className="flex flex-col gap-1.5">
              {filteredFunctionCallEntries.map((fn, index) => (
                <PickerCard
                  key={`${fn.requirePath}:${fn.variableName}:${fn.functionName}:${index}`}
                  label={`${fn.functionName}(${fn.params})`}
                  description={`Call via ${fn.variableName} (${fn.requirePath})`}
                  onClick={() => handleAddFunctionCall(fn)}
                />
              ))}
            </div>
          </div>
        )}

        {addableDefinitions.length === 0 && filteredFunctionCallEntries.length === 0 && filteredSameFileEntries.length === 0 && (
          <div className="px-1 py-2 text-xs text-neutral-500">No matching nodes</div>
        )}
      </div>
    </div>
  );
}

function PickerCard({
  label,
  description,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={description}
      className={`rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5 text-left text-xs shadow-sm ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-sky-500"
      }`}
    >
      <div className="font-medium text-neutral-100">{label}</div>
      <div className="truncate text-neutral-400">{description}</div>
    </button>
  );
}
