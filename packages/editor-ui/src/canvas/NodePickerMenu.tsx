import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { XYPosition } from "@xyflow/react";
import type { NodeCategory, NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { resolveRequiredFunctions, type ResolvedFunction, type ResolvedRequireModule } from "../lib/resolveRequiredFunctions.js";
import { CATEGORY_ORDER, CATEGORY_THEME } from "./categoryTheme.js";
import { CategoryIcon } from "./CategoryIcon.js";
import { FunctionUsageMenu } from "./FunctionUsageMenu.js";
import type { FunctionUsage } from "./effectivePorts.js";

export interface NodePickerMenuProps {
  screenX: number;
  screenY: number;
  flowPosition: XYPosition;
  onClose: () => void;
}

const MENU_WIDTH = 240;
const MENU_MAX_HEIGHT = 360;

export function NodePickerMenu({ screenX, screenY, flowPosition, onClose }: NodePickerMenuProps) {
  const nodeDefinitions = useFlowStore((s) => s.nodeDefinitions);
  const addNodeFromPalette = useFlowStore((s) => s.addNodeFromPalette);
  const addFunctionCallNode = useFlowStore((s) => s.addFunctionCallNode);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const nodes = useFlowStore((s) => s.nodes);

  const [query, setQuery] = useState("");
  // Set instead of immediately adding when a Function node is picked — see
  // FunctionUsageMenu's doc comment. Swaps this same fixed-position box over to the
  // Callback/Standalone choice rather than closing the picker outright.
  const [pendingFunctionAdd, setPendingFunctionAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const requireNodes = useMemo(() => nodes.filter((n) => n.type === "logic.require"), [nodes]);
  // Only re-fetch when a Require node's own config changes, not on every unrelated
  // store update (e.g. dragging a node also updates `nodes`' reference) — mirrors
  // RequiredModulesPanel's signature-gated effect.
  const requireSignature = requireNodes
    .map((n) => `${n.id}:${n.data?.path}:${n.data?.variableName}`)
    .join("|");

  const [requiredModules, setRequiredModules] = useState<ResolvedRequireModule[]>([]);

  useEffect(() => {
    if (requireNodes.length === 0 || !currentFilePath) {
      setRequiredModules([]);
      return;
    }

    let cancelled = false;
    resolveRequiredFunctions(currentFilePath, requireNodes).then((results) => {
      if (!cancelled) setRequiredModules(results);
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

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = Object.values(nodeDefinitions).filter(
      // logic.functionCall is never useful added blank — it's only ever meaningful pre-filled
      // from a specific resolved Require'd function, offered below in the "Function Calls"
      // group. variable.get/variable.set are never useful added blank either — they need a
      // bound `data.variableId`, only ever set via dragging a row out of the Variables panel
      // (VariableDropMenu), never via this generic catalog.
      (def) =>
        def.type !== "logic.functionCall" &&
        def.type !== "variable.get" &&
        def.type !== "variable.set" &&
        (def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q)),
    );
    const byCategory = new Map<NodeCategory, NodeDefinition[]>();
    for (const def of filtered) {
      const list = byCategory.get(def.category) ?? [];
      list.push(def);
      byCategory.set(def.category, list);
    }
    return byCategory;
  }, [nodeDefinitions, query]);

  const functionCallEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = requiredModules.flatMap((mod) => mod.functions);
    return all.filter((fn) => {
      const label = `${fn.functionName}(${fn.params})`;
      const description = `Call via ${fn.variableName} (${fn.requirePath})`;
      return label.toLowerCase().includes(q) || description.toLowerCase().includes(q);
    });
  }, [requiredModules, query]);

  const left = Math.max(8, Math.min(screenX, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(screenY, window.innerHeight - MENU_MAX_HEIGHT - 8));

  if (pendingFunctionAdd) {
    return <FunctionUsageMenu x={screenX} y={screenY} onChoose={handleChooseFunctionUsage} onClose={onClose} />;
  }

  function handleSelect(type: string) {
    if (type === "logic.function") {
      setPendingFunctionAdd(true);
      return;
    }
    addNodeFromPalette(type, flowPosition);
    onClose();
  }

  function handleChooseFunctionUsage(usage: FunctionUsage) {
    addNodeFromPalette("logic.function", flowPosition, { usage });
    onClose();
  }

  function handleSelectFunctionCall(entry: ResolvedFunction) {
    addFunctionCallNode(entry, flowPosition);
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
        {CATEGORY_ORDER.filter((c) => c !== "debugging" && grouped.has(c)).map((category) => (
          <PickerGroup key={category} category={category} title={CATEGORY_THEME[category].label}>
            {grouped.get(category)!.map((def) => (
              <PickerCard key={def.type} label={def.label} description={def.description} onClick={() => handleSelect(def.type)} />
            ))}
          </PickerGroup>
        ))}
        {functionCallEntries.length > 0 && (
          <PickerGroup title="Function Calls">
            {functionCallEntries.map((fn, index) => {
              const label = `${fn.functionName}(${fn.params})`;
              const description = `Call via ${fn.variableName} (${fn.requirePath})`;
              return (
                <PickerCard
                  key={`${fn.requirePath}:${fn.variableName}:${fn.functionName}:${index}`}
                  label={label}
                  description={description}
                  onClick={() => handleSelectFunctionCall(fn)}
                />
              );
            })}
          </PickerGroup>
        )}
        {grouped.has("debugging") && (
          <PickerGroup category="debugging" title={CATEGORY_THEME.debugging.label}>
            {grouped.get("debugging")!.map((def) => (
              <PickerCard key={def.type} label={def.label} description={def.description} onClick={() => handleSelect(def.type)} />
            ))}
          </PickerGroup>
        )}
        {grouped.size === 0 && functionCallEntries.length === 0 && (
          <div className="px-1 py-2 text-xs text-neutral-500">No matching nodes</div>
        )}
      </div>
    </div>
  );
}

function PickerGroup({
  title,
  category,
  children,
}: {
  title: string;
  category?: NodeCategory;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {category && (
          <span style={{ color: CATEGORY_THEME[category].accentHex }}>
            <CategoryIcon category={category} className="h-3 w-3" />
          </span>
        )}
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function PickerCard({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={description}
      className="rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5 text-left text-xs shadow-sm hover:border-sky-500"
    >
      <div className="font-medium text-neutral-100">{label}</div>
      <div className="truncate text-neutral-400">{description}</div>
    </button>
  );
}
