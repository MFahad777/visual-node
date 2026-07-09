import { useEffect, useMemo, useRef, useState } from "react";
import type { XYPosition } from "@xyflow/react";
import type { NodeCategory, NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { resolveRequiredFunctions, type ResolvedFunction, type ResolvedRequireModule } from "../lib/resolveRequiredFunctions.js";
import { CATEGORY_ORDER, CATEGORY_THEME } from "./categoryTheme.js";
import { CategoryIcon } from "./CategoryIcon.js";
import { FunctionUsageMenu } from "./FunctionUsageMenu.js";
import type { FunctionUsage } from "./effectivePorts.js";
import { VirtualizedNodeList, type VirtualizedNodeItem } from "../components/VirtualizedNodeList.js";

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

  const virtualItems = useMemo(() => {
    const items: VirtualizedNodeItem[] = [];
    const categoriesNonDebug = CATEGORY_ORDER.filter((c) => c !== "debugging" && grouped.has(c));

    // Add non-debugging categories
    for (const category of categoriesNonDebug) {
      items.push({
        id: `header-${category}`,
        type: "header",
        category,
        label: CATEGORY_THEME[category].label,
      });
      const defs = grouped.get(category) || [];
      for (const def of defs) {
        items.push({
          id: def.type,
          type: "node",
          label: def.label,
          definition: def,
          description: def.description,
          isPlugin: def.type.startsWith("plugin."),
        });
      }
    }

    // Add Function Calls
    if (functionCallEntries.length > 0) {
      items.push({
        id: "header-function-calls",
        type: "header",
        label: "Function Calls",
      });
      for (const entry of functionCallEntries) {
        const label = `${entry.functionName}(${entry.params})`;
        items.push({
          id: `${entry.requirePath}:${entry.variableName}:${entry.functionName}`,
          type: "functionCall",
          label,
          description: `Call via ${entry.variableName} (${entry.requirePath})`,
        });
      }
    }

    // Add debugging category if present
    if (grouped.has("debugging")) {
      items.push({
        id: "header-debugging",
        type: "header",
        category: "debugging",
        label: CATEGORY_THEME.debugging.label,
      });
      const defs = grouped.get("debugging") || [];
      for (const def of defs) {
        items.push({
          id: def.type,
          type: "node",
          label: def.label,
          definition: def,
          description: def.description,
          isPlugin: def.type.startsWith("plugin."),
        });
      }
    }

    return items;
  }, [grouped, functionCallEntries]);

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

  const handleSelectItem = (item: VirtualizedNodeItem) => {
    if (item.type === "node" && item.definition) {
      handleSelect(item.definition.type);
    } else if (item.type === "functionCall") {
      const entry = functionCallEntries.find(
        (e) => `${e.requirePath}:${e.variableName}:${e.functionName}` === item.id
      );
      if (entry) handleSelectFunctionCall(entry);
    }
  };

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
      {virtualItems.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-2 py-2 text-xs text-neutral-400">No matching nodes</div>
      ) : (
        <VirtualizedNodeList
          items={virtualItems}
          onSelect={handleSelectItem}
          disabled={false}
        />
      )}
    </div>
  );
}
