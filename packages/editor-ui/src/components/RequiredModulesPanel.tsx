import { useEffect, useMemo, useState } from "react";
import { useFlowStore } from "../store/flowStore.js";
import { resolveRequiredFunctions, type ResolvedRequireModule } from "../lib/resolveRequiredFunctions.js";
import { CategoryIcon } from "../canvas/CategoryIcon.js";
import { CATEGORY_THEME } from "../canvas/categoryTheme.js";

type RequiredModuleInfo = ResolvedRequireModule;

// Shows what each Require node in the current file actually makes available —
// the exported (Function -> Export-connected) functions of the target file —
// since Require itself has no ports; the imported variable is only usable as a
// bare identifier inside a Custom Code / Console Log expression field.
export function RequiredModulesPanel() {
  const nodes = useFlowStore((s) => s.nodes);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);

  const requireNodes = useMemo(() => nodes.filter((n) => n.type === "logic.require"), [nodes]);
  // Only re-fetch when a Require node's own config changes, not on every
  // unrelated edit (e.g. dragging a node updates `nodes`' reference too).
  const requireSignature = requireNodes
    .map((n) => `${n.id}:${n.data?.path}:${n.data?.variableName}:${n.data?.sourceType}:${n.data?.version}`)
    .join("|");

  const [modules, setModules] = useState<RequiredModuleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (requireNodes.length === 0 || !currentFilePath) {
      setModules([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    resolveRequiredFunctions(currentFilePath, requireNodes).then((results) => {
      if (!cancelled) {
        setModules(results);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilePath, requireSignature]);

  if (requireNodes.length === 0) return null;

  return (
    <div className="mt-4 border-t border-black/60 pt-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Required Modules</h3>
      {isLoading && modules.length === 0 ? (
        <p className="text-xs text-neutral-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {modules.map((mod) => (
            <ModuleCard key={mod.variableName + mod.requirePath} module={mod} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleCard({ module: mod }: { module: RequiredModuleInfo }) {
  return (
    <div
      className={`overflow-hidden rounded-lg border shadow-sm shadow-black/40 ${
        mod.error ? "border-red-500/60" : "border-black/60"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 ${mod.error ? "bg-red-900/40" : ""}`}
        style={mod.error ? undefined : { backgroundColor: CATEGORY_THEME.logic.accentHex }}
      >
        {!mod.error && <CategoryIcon category="logic" className="h-3.5 w-3.5 text-white" />}
        <span className="truncate font-mono text-[11px] font-bold text-white" title={mod.requirePath}>
          {mod.variableName}
        </span>
        <span className="ml-auto truncate text-[10px] text-white/60" title={mod.requirePath}>
          {mod.requirePath}
        </span>
      </div>

      <div className="bg-[#2a2a2a] px-2 py-1.5">
        {mod.error ? (
          <p className="text-[11px] text-red-400">{mod.error}</p>
        ) : mod.isNpm ? (
          <p className="text-[11px] text-neutral-400">npm package — functions not auto-discovered.</p>
        ) : mod.functions.length === 0 ? (
          <p className="text-[11px] text-neutral-400">No exported functions.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {mod.functions.map((fn) => (
              <FunctionRow key={fn.functionName} variableName={mod.variableName} fn={fn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FunctionRow({ variableName, fn }: { variableName: string; fn: RequiredModuleInfo["functions"][number] }) {
  const [copied, setCopied] = useState(false);
  const callSnippet = `${variableName}.${fn.functionName}(${fn.params})`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(callSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be denied by the browser — the signature is still visible to copy by hand.
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy "${callSnippet}"`}
      className="group flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-white/5"
    >
      <span className="text-[10px] text-violet-400">ƒ</span>
      <span className="truncate font-mono text-[11px] text-neutral-200">
        {fn.functionName}
        <span className="text-neutral-400">({fn.params})</span>
      </span>
      <span className="ml-auto shrink-0 text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100">
        {copied ? "Copied!" : "Copy call"}
      </span>
    </button>
  );
}
