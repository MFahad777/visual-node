import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { NodeCategory, NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { resolveRequiredFunctions, type ResolvedFunction } from "../lib/resolveRequiredFunctions.js";
import { CATEGORY_ORDER, CATEGORY_THEME } from "../canvas/categoryTheme.js";
import { FunctionUsageMenu } from "../canvas/FunctionUsageMenu.js";
import type { FunctionUsage } from "../canvas/effectivePorts.js";
import { VirtualizedNodeList, type VirtualizedNodeItem } from "./VirtualizedNodeList.js";

export function NodeBrowserModal() {
  const isNodeBrowserOpen = useFlowStore((s) => s.isNodeBrowserOpen);
  const nodeDefinitions = useFlowStore((s) => s.nodeDefinitions);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const nodes = useFlowStore((s) => s.nodes);
  const addNodeFromBrowser = useFlowStore((s) => s.addNodeFromBrowser);
  const addFunctionCallNode = useFlowStore((s) => s.addFunctionCallNode);
  const closeNodeBrowser = useFlowStore((s) => s.closeNodeBrowser);

  const [query, setQuery] = useState("");
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  // Anchors FunctionUsageMenu near the clicked Function card instead of adding immediately
  // — see FunctionUsageMenu's doc comment for why Function nodes need this extra step.
  const [functionUsagePopup, setFunctionUsagePopup] = useState<{ x: number; y: number } | null>(null);

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
        (def.label.toLowerCase().startsWith(q) || def.description.toLowerCase().startsWith(q)),
    );
    const byCategory = new Map<NodeCategory, NodeDefinition[]>();
    for (const def of filtered) {
      const list = byCategory.get(def.category) ?? [];
      list.push(def);
      byCategory.set(def.category, list);
    }
    return byCategory;
  }, [nodeDefinitions, query]);

  // Virtual "Function Call" entries — one per exported function of every
  // `logic.require` node's target file in the current blueprint file. Mirrors
  // RequiredModulesPanel's fetch-on-signature-change pattern so this doesn't
  // refetch on every unrelated node drag.
  const requireNodes = useMemo(() => nodes.filter((n) => n.type === "logic.require"), [nodes]);
  const requireSignature = requireNodes
    .map((n) => `${n.id}:${n.data?.path}:${n.data?.variableName}`)
    .join("|");

  const [resolvedModules, setResolvedModules] = useState<Awaited<ReturnType<typeof resolveRequiredFunctions>>>([]);

  useEffect(() => {
    if (requireNodes.length === 0 || !currentFilePath) {
      setResolvedModules([]);
      return;
    }

    let cancelled = false;
    resolveRequiredFunctions(currentFilePath, requireNodes).then((results) => {
      if (!cancelled) setResolvedModules(results);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilePath, requireSignature]);

  const functionCallEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = resolvedModules.flatMap((mod) => mod.functions);
    return all.filter((fn) => {
      const label = `${fn.functionName}(${fn.params})`.toLowerCase();
      const description = `Call via ${fn.variableName} (${fn.requirePath})`.toLowerCase();
      return label.startsWith(q) || description.startsWith(q);
    });
  }, [resolvedModules, query]);

  // Build a flat list of virtualized items: headers + node cards + function calls
  const virtualItems = useMemo(() => {
    const items: VirtualizedNodeItem[] = [];
    const logicIndex = CATEGORY_ORDER.indexOf("logic");
    const categoriesBeforeFunctionCalls = CATEGORY_ORDER.slice(0, logicIndex + 1).filter((c) => grouped.has(c));
    const categoriesAfterFunctionCalls = CATEGORY_ORDER.slice(logicIndex + 1).filter((c) => grouped.has(c));

    // Add categories before Function Calls
    for (const category of categoriesBeforeFunctionCalls) {
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

    // Add categories after Function Calls
    for (const category of categoriesAfterFunctionCalls) {
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

    return items;
  }, [grouped, functionCallEntries]);

  if (!isNodeBrowserOpen) return null;

  function handleAdd(def: NodeDefinition, event: MouseEvent<HTMLButtonElement>) {
    if (def.type === "logic.function") {
      setFunctionUsagePopup({ x: event.clientX, y: event.clientY });
      return;
    }
    addNodeFromBrowser(def.type);
    setLastAdded(def.label);
  }

  function handleChooseFunctionUsage(usage: FunctionUsage) {
    addNodeFromBrowser("logic.function", { usage });
    setLastAdded("Function");
    setFunctionUsagePopup(null);
  }

  function handleAddFunctionCall(entry: ResolvedFunction) {
    addFunctionCallNode(entry);
    setLastAdded(`${entry.functionName}(${entry.params})`);
  }

  const handleSelectItem = (item: VirtualizedNodeItem) => {
    if (item.type === "node" && item.definition) {
      const event = new MouseEvent("click") as any;
      handleAdd(item.definition, event);
    } else if (item.type === "functionCall") {
      const entry = functionCallEntries.find(
        (e) => `${e.requirePath}:${e.variableName}:${e.functionName}` === item.id
      );
      if (entry) handleAddFunctionCall(entry);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={closeNodeBrowser}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[80vh] w-[640px] flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <h2 className="text-sm font-semibold text-neutral-100">Built-in Nodes</h2>
          <button onClick={closeNodeBrowser} className="text-neutral-400 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div className="border-b border-black/60 p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-full rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-500"
          />
          {currentFilePath === null && (
            <p className="mt-2 text-xs text-amber-400">Open a file first — nodes are added to the current canvas.</p>
          )}
          {lastAdded && currentFilePath !== null && (
            <p className="mt-2 text-xs text-green-400">Added "{lastAdded}" to the canvas.</p>
          )}
        </div>

        <div className="min-h-0 flex-1 border-t border-black/60">
          {virtualItems.length === 0 ? (
            <div className="flex items-center justify-center p-3 text-xs text-neutral-400">No matching nodes</div>
          ) : (
            <VirtualizedNodeList
              items={virtualItems}
              onSelect={handleSelectItem}
              disabled={currentFilePath === null}
            />
          )}
        </div>
      </div>
      {functionUsagePopup && (
        <FunctionUsageMenu
          x={functionUsagePopup.x}
          y={functionUsagePopup.y}
          onChoose={handleChooseFunctionUsage}
          onClose={() => setFunctionUsagePopup(null)}
        />
      )}
    </div>
  );
}
