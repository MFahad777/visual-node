import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "./components/Toolbar.js";
import { EditorTabBar } from "./components/EditorTabBar.js";
import { FileExplorer } from "./components/FileExplorer.js";
import { NodeConfigPanel } from "./components/NodeConfigPanel.js";
import { CodePreviewModal } from "./components/CodePreviewModal.js";
import { CodeExpandModal } from "./components/CodeExpandModal.js";
import { FunctionGraphTabView } from "./components/FunctionGraphTabView.js";
import { FunctionGraphSidePanel } from "./components/FunctionGraphSidePanel.js";
import { NodeBrowserModal } from "./components/NodeBrowserModal.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { ServerLogPanel } from "./components/ServerLogPanel.js";
import { ErrorLogPanel } from "./components/ErrorLogPanel.js";
import { FlowCanvas } from "./canvas/FlowCanvas.js";
import { useFlowStore } from "./store/flowStore.js";
import { useFileTreeStore } from "./store/fileTreeStore.js";
import { useEditorTabsStore } from "./store/editorTabsStore.js";

export function App() {
  const bootstrap = useFlowStore((s) => s.bootstrap);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const activeTabId = useEditorTabsStore((s) => s.activeTabId);
  const functionGraphTabs = useEditorTabsStore((s) => s.functionGraphTabs);

  useEffect(() => {
    void bootstrap();
    void useFileTreeStore.getState().refreshTree();
  }, [bootstrap]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#1b1b1b]">
      <Toolbar />
      <EditorTabBar />
      <div className="flex flex-1 overflow-hidden">
        <FileExplorer />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="relative flex-1">
            {currentFilePath === null ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                Select or create a file to begin
              </div>
            ) : (
              <>
                {/* Every open tab's canvas stays mounted (visibility toggled via `hidden`,
                    not conditional unmount) so pan/zoom/selection survive switching — see
                    Phase 21 doc. */}
                <div className={`absolute inset-0 ${activeTabId === "main" ? "" : "hidden"}`}>
                  <ReactFlowProvider>
                    <FlowCanvas />
                  </ReactFlowProvider>
                </div>
                {functionGraphTabs.map((tab) => (
                  <div
                    key={tab.functionNodeId}
                    className={`absolute inset-0 ${activeTabId === tab.functionNodeId ? "" : "hidden"}`}
                  >
                    <FunctionGraphTabView functionNodeId={tab.functionNodeId} tabStore={tab.store} />
                  </div>
                ))}
              </>
            )}
          </div>
          <ErrorLogPanel />
          <ServerLogPanel />
        </main>
        {activeTabId === "main" ? <NodeConfigPanel /> : <FunctionGraphSidePanel />}
      </div>
      <CodePreviewModal />
      <CodeExpandModal />
      <NodeBrowserModal />
      <SettingsModal />
    </div>
  );
}
