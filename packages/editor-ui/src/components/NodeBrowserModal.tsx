import { useEffect, useMemo, useState } from "react";
import type { NodeCategory, NodeDefinition } from "@visual-node/core";
import { useFlowStore } from "../store/flowStore.js";
import { resolveRequiredFunctions, type ResolvedFunction } from "../lib/resolveRequiredFunctions.js";
import { CATEGORY_ORDER, CATEGORY_THEME } from "../canvas/categoryTheme.js";
import { CategoryIcon } from "../canvas/CategoryIcon.js";

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
      return label.includes(q) || description.includes(q);
    });
  }, [resolvedModules, query]);

  if (!isNodeBrowserOpen) return null;

  function handleAdd(def: NodeDefinition) {
    addNodeFromBrowser(def.type);
    setLastAdded(def.label);
  }

  function handleAddFunctionCall(entry: ResolvedFunction) {
    addFunctionCallNode(entry);
    setLastAdded(`${entry.functionName}(${entry.params})`);
  }

  function renderCategoryGroup(category: NodeCategory) {
    const theme = CATEGORY_THEME[category];
    return (
      <div key={category} className="mb-4 last:mb-0">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          <span style={{ color: theme.accentHex }}>
            <CategoryIcon category={category} className="h-3 w-3" />
          </span>
          {theme.label}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {grouped.get(category)!.map((def) => (
            <button
              key={def.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/flowserver-node-type", def.type);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => handleAdd(def)}
              disabled={currentFilePath === null}
              title={def.description}
              className="relative rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5 text-left text-xs shadow-sm hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 font-medium text-neutral-100">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: theme.accentHex }}
                >
                  <CategoryIcon category={category} className="h-2.5 w-2.5 text-white" />
                </span>
                <span className="truncate">{def.label}</span>
                {def.type.startsWith("plugin.") && (
                  <span className="ml-auto shrink-0 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                    Plugin
                  </span>
                )}
              </div>
              <div className="truncate text-neutral-400">{def.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Function Calls group sits between "Logic" and "Debugging" in CATEGORY_ORDER.
  const logicIndex = CATEGORY_ORDER.indexOf("logic");
  const categoriesBeforeFunctionCalls = CATEGORY_ORDER.slice(0, logicIndex + 1).filter((c) => grouped.has(c));
  const categoriesAfterFunctionCalls = CATEGORY_ORDER.slice(logicIndex + 1).filter((c) => grouped.has(c));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={closeNodeBrowser}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-[640px] flex-col rounded-lg border border-black/60 bg-[#242424] shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-black/60 px-4 py-2">
          <h2 className="text-sm font-semibold text-neutral-100">Built-in Nodes</h2>
          <button onClick={closeNodeBrowser} className="text-neutral-500 hover:text-neutral-300">
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

        <div className="flex-1 overflow-y-auto p-3">
          {categoriesBeforeFunctionCalls.map(renderCategoryGroup)}
          {functionCallEntries.length > 0 && (
            <div className="mb-4 last:mb-0">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Function Calls
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {functionCallEntries.map((entry, index) => {
                  const label = `${entry.functionName}(${entry.params})`;
                  const description = `Call via ${entry.variableName} (${entry.requirePath})`;
                  return (
                    <button
                      key={`${entry.requirePath}:${entry.variableName}:${entry.functionName}:${index}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/flowserver-function-call", JSON.stringify(entry));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => handleAddFunctionCall(entry)}
                      disabled={currentFilePath === null}
                      title={description}
                      className="rounded border border-neutral-700 bg-[#2a2a2a] px-2 py-1.5 text-left text-xs shadow-sm hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="font-medium text-neutral-100">{label}</div>
                      <div className="truncate text-neutral-400">{description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {categoriesAfterFunctionCalls.map(renderCategoryGroup)}
          {grouped.size === 0 && functionCallEntries.length === 0 && (
            <div className="px-1 py-2 text-xs text-neutral-500">No matching nodes</div>
          )}
        </div>
      </div>
    </div>
  );
}
