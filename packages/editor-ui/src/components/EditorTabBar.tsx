import type { Node } from "@xyflow/react";
import { useFlowStore } from "../store/flowStore.js";
import { useEditorTabsStore, type FunctionGraphTab } from "../store/editorTabsStore.js";

/** Resolves a tab's own display name from whichever store actually owns its outer node —
 * `flowStore` for a "main"-parented tab, or the parent tab's own graph store for a
 * recursively-nested one (a Promise node opened from inside another tab's canvas). */
function resolveTabLabel(tab: FunctionGraphTab, tabs: FunctionGraphTab[], mainNodes: Node[]): string {
  if (tab.parentTabId === "main") {
    return String(mainNodes.find((n) => n.id === tab.functionNodeId)?.data?.name ?? "(unnamed)");
  }
  const parentTab = tabs.find((t) => t.functionNodeId === tab.parentTabId);
  const node = parentTab?.store.getState().nodes.find((n) => n.id === tab.functionNodeId);
  return String(node?.data?.name ?? "(unnamed)");
}

/** The full chain of tab labels from the Main Graph down to `tab`, for the breadcrumb row. */
function ancestorChainLabels(tab: FunctionGraphTab, tabs: FunctionGraphTab[], mainNodes: Node[]): string[] {
  const labels: string[] = [];
  let current: FunctionGraphTab | undefined = tab;
  while (current) {
    labels.unshift(resolveTabLabel(current, tabs, mainNodes));
    current = current.parentTabId === "main" ? undefined : tabs.find((t) => t.functionNodeId === current!.parentTabId);
  }
  return labels;
}

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

  const activeTab = functionGraphTabs.find((t) => t.functionNodeId === activeTabId);
  const activeBreadcrumb = activeTab ? ancestorChainLabels(activeTab, functionGraphTabs, nodes).join(" > ") : null;

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
          const label = resolveTabLabel(tab, functionGraphTabs, nodes);
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
        {activeBreadcrumb && (
          <>
            <span className="text-neutral-700">&gt;</span>
            <span className="text-neutral-300">{activeBreadcrumb} (Blueprint Graph)</span>
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
