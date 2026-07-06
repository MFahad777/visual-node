import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "./components/Toolbar.js";
import { FileExplorer } from "./components/FileExplorer.js";
import { NodeConfigPanel } from "./components/NodeConfigPanel.js";
import { CodePreviewModal } from "./components/CodePreviewModal.js";
import { CodeExpandModal } from "./components/CodeExpandModal.js";
import { FunctionGraphModal } from "./components/FunctionGraphModal.js";
import { NodeBrowserModal } from "./components/NodeBrowserModal.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { ServerLogPanel } from "./components/ServerLogPanel.js";
import { ErrorLogPanel } from "./components/ErrorLogPanel.js";
import { FlowCanvas } from "./canvas/FlowCanvas.js";
import { useFlowStore } from "./store/flowStore.js";
import { useFileTreeStore } from "./store/fileTreeStore.js";

export function App() {
  const bootstrap = useFlowStore((s) => s.bootstrap);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);

  useEffect(() => {
    void bootstrap();
    void useFileTreeStore.getState().refreshTree();
  }, [bootstrap]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#1b1b1b]">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <FileExplorer />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1">
            {currentFilePath === null ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                Select or create a file to begin
              </div>
            ) : (
              <ReactFlowProvider>
                <FlowCanvas />
              </ReactFlowProvider>
            )}
          </div>
          <ErrorLogPanel />
          <ServerLogPanel />
        </div>
        <NodeConfigPanel />
      </div>
      <CodePreviewModal />
      <CodeExpandModal />
      <FunctionGraphModal />
      <NodeBrowserModal />
      <SettingsModal />
    </div>
  );
}
