import { useFlowStore } from "../store/flowStore.js";
import { useEditorTabsStore } from "../store/editorTabsStore.js";

/**
 * Phase 21: replaces the old `FunctionGraphModal` overlay with an Unreal-Engine-Blueprint-
 * style tab strip + breadcrumb, always visible under `Toolbar`. The "Main Graph" tab is
 * always present and never closable; one additional tab exists per currently open function
 * graph (`editorTabsStore.functionGraphTabs`), closable via its own "×". Back/forward arrows
 * walk `editorTabsStore`'s generic tab-id history stack — built generically (not hardcoded to
 * "two levels") so it keeps working if a future phase adds deeper nesting.
 */
export function EditorTabBar() {
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const nodes = useFlowStore((s) => s.nodes);
  const activeTabId = useEditorTabsStore((s) => s.activeTabId);
  const functionGraphTabs = useEditorTabsStore((s) => s.functionGraphTabs);
  const historyIndex = useEditorTabsStore((s) => s.historyIndex);
  const historyLength = useEditorTabsStore((s) => s.history.length);
  const navigateTo = useEditorTabsStore((s) => s.navigateTo);
  const closeFunctionGraphTab = useEditorTabsStore((s) => s.closeFunctionGraphTab);
  const goBack = useEditorTabsStore((s) => s.goBack);
  const goForward = useEditorTabsStore((s) => s.goForward);

  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() ?? currentFilePath : "No file open";

  const activeFunctionName =
    activeTabId !== "main"
      ? String(nodes.find((n) => n.id === activeTabId)?.data?.name ?? "function")
      : null;

  return (
    <div className="flex flex-col border-b border-black/60 bg-[#202020]">
      <div className="flex h-9 items-center gap-1 px-2">
        <button
          onClick={goBack}
          disabled={historyIndex <= 0}
          title="Back"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 enabled:hover:bg-white/10 enabled:hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ◀
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= historyLength - 1}
          title="Forward"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 enabled:hover:bg-white/10 enabled:hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▶
        </button>

        <div className="mx-1 h-5 w-px bg-black/60" />

        <TabButton label="Main Graph" isActive={activeTabId === "main"} onClick={() => navigateTo("main")} />

        {functionGraphTabs.map((tab) => {
          const functionNode = nodes.find((n) => n.id === tab.functionNodeId);
          const label = String(functionNode?.data?.name ?? "(unnamed)");
          return (
            <TabButton
              key={tab.functionNodeId}
              label={label}
              isActive={activeTabId === tab.functionNodeId}
              onClick={() => navigateTo(tab.functionNodeId)}
              onClose={() => closeFunctionGraphTab(tab.functionNodeId)}
            />
          );
        })}
      </div>

      <div className="flex h-6 items-center gap-1 border-t border-black/40 px-3 text-[11px] text-neutral-400">
        <span>{fileName}</span>
        {activeFunctionName && (
          <>
            <span className="text-neutral-700">&gt;</span>
            <span className="text-neutral-300">{activeFunctionName} (Blueprint Graph)</span>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  isActive,
  onClick,
  onClose,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex h-7 cursor-pointer items-center gap-2 rounded-t border-x border-t px-3 text-xs font-medium ${
        isActive
          ? "border-black/60 bg-[#2a2a2a] text-neutral-100"
          : "border-transparent text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
      }`}
    >
      <span>{label}</span>
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close"
          className="flex h-4 w-4 items-center justify-center rounded text-neutral-400 hover:bg-red-500/20 hover:text-red-400"
        >
          ×
        </button>
      )}
    </div>
  );
}
