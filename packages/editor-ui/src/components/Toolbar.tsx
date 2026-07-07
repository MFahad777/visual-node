import { useRef, type ChangeEvent } from "react";
import { useFlowStore, selectIsCompileStale } from "../store/flowStore.js";
import { PLUGIN_NODE_TEMPLATE } from "../lib/pluginTemplate.js";

/** Pure client-side download — no RPC. Builds the worked HTTP Request example plugin JSON
 * and triggers a browser download via the standard Blob + temporary-anchor pattern. */
function downloadPluginTemplate() {
  const json = JSON.stringify(PLUGIN_NODE_TEMPLATE, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "http-request.node.json";
  a.click();
  URL.revokeObjectURL(url);
}

function scriptOutputName(blueprintPath: string | null): string {
  if (!blueprintPath) return "script.js";
  const name = blueprintPath.split("/").pop() || "script";
  return name.replace(/\.blueprint$/, ".js");
}

export function Toolbar() {
  const isDirty = useFlowStore((s) => s.isDirty);
  const isSaving = useFlowStore((s) => s.isSaving);
  const isCompiling = useFlowStore((s) => s.isCompiling);
  const validationErrors = useFlowStore((s) => s.validationErrors);
  const compiledResults = useFlowStore((s) => s.compiledResults);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const projectSettings = useFlowStore((s) => s.projectSettings);
  const projectDir = useFlowStore((s) => s.projectDir);
  const lastError = useFlowStore((s) => s.lastError);
  const saveFlow = useFlowStore((s) => s.saveFlow);
  const compileProject = useFlowStore((s) => s.compileProject);
  const openPreview = useFlowStore((s) => s.openPreview);
  const openNodeBrowser = useFlowStore((s) => s.openNodeBrowser);
  const compileErrors = useFlowStore((s) => s.compileErrors);
  const toggleErrorLog = useFlowStore((s) => s.toggleErrorLog);
  const isServerRunning = useFlowStore((s) => s.isServerRunning);
  const isStartingServer = useFlowStore((s) => s.isStartingServer);
  const isStoppingServer = useFlowStore((s) => s.isStoppingServer);
  const startServer = useFlowStore((s) => s.startServer);
  const stopServer = useFlowStore((s) => s.stopServer);
  const openSettings = useFlowStore((s) => s.openSettings);
  const isCompileStale = useFlowStore(selectIsCompileStale);
  const installPlugin = useFlowStore((s) => s.installPlugin);
  const pluginFileInputRef = useRef<HTMLInputElement | null>(null);

  function displayProjectDir(dir: string | null): string {
    if (!dir) return "No project";
    const parts = dir.split(/[/\\]/);
    return parts[parts.length - 1] || dir;
  }

  async function handlePluginFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await installPlugin(bytes);
  }

  const hasErrors = validationErrors.length > 0;
  const problemCount = validationErrors.length + compileErrors.length;
  const compileDisabled = isCompiling || currentFilePath === null || isDirty;
  const compileTitle =
    currentFilePath === null
      ? "Open a file first"
      : isDirty
        ? "Save your changes before compiling — Compile always reads the project from disk"
        : "Compile the whole project to Express code";

  const isScriptMode = projectSettings?.mode === "script";
  const runDisabled = hasErrors || isStartingServer || isCompileStale || (isScriptMode && !currentFilePath);
  const runButtonLabel = isScriptMode ? `Run ${scriptOutputName(currentFilePath)}` : "Run Server";
  const runTitle = hasErrors
    ? `Fix ${validationErrors.length} issue(s) before running: ${validationErrors[0].message}`
    : isCompileStale
      ? "Click Compile first — Run always reads the project from disk"
      : isScriptMode && !currentFilePath
        ? "Open a file first"
        : "Compile and run the project";

  return (
    <div className="flex h-12 items-center gap-2 border-b border-black/60 bg-[#242424] px-3">
      <span className="mr-1 text-sm font-bold tracking-wide text-neutral-100">FlowServer</span>
      <span title={projectDir ?? undefined} className="mr-2 text-xs text-neutral-500">
        {displayProjectDir(projectDir)}
      </span>
      <span className="mr-2 text-xs text-neutral-500">{currentFilePath ?? "No file open"}</span>

      <button
        onClick={saveFlow}
        disabled={isSaving || currentFilePath === null}
        title={currentFilePath === null ? "Open a file first" : undefined}
        className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
      >
        {isSaving ? "Saving…" : isDirty ? "Save*" : "Save"}
      </button>

      <button
        onClick={openNodeBrowser}
        className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
      >
        Browse Nodes
      </button>

      <button
        onClick={openSettings}
        className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
      >
        Settings
      </button>

      <input
        ref={pluginFileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handlePluginFileSelected}
      />
      <button
        onClick={() => pluginFileInputRef.current?.click()}
        title="Upload a .node.json plugin spec — see docs/phase9-npm-package-support-plan.md"
        className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
      >
        Install Plugin
      </button>

      <button
        onClick={downloadPluginTemplate}
        title="Download a worked example plugin spec (HTTP Request via axios) to use as a starting point"
        className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
      >
        Download Plugin Template
      </button>

      <button
        onClick={() => compileProject()}
        disabled={compileDisabled}
        title={compileTitle}
        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isCompiling ? "Compiling…" : "Compile"}
      </button>

      <button
        onClick={openPreview}
        disabled={compiledResults === null}
        className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
      >
        Preview
      </button>

      {isServerRunning ? (
        <button
          onClick={() => stopServer()}
          disabled={isStoppingServer}
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isStoppingServer ? "Stopping…" : "Stop Server"}
        </button>
      ) : (
        <button
          onClick={() => startServer()}
          disabled={runDisabled}
          title={runTitle}
          className="rounded border border-green-600 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-600/10 disabled:opacity-50"
        >
          {isStartingServer ? "Starting…" : runButtonLabel}
        </button>
      )}

      <button
        onClick={toggleErrorLog}
        className="ml-auto flex items-center gap-1.5 rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        title="Show validation and compile errors"
      >
        Problems
        {problemCount > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {problemCount}
          </span>
        )}
      </button>

      {lastError && <span className="text-xs text-red-400">{lastError}</span>}
    </div>
  );
}
