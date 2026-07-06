import { useEffect, useState } from "react";
import { useFlowStore } from "../store/flowStore.js";
import { useFileTreeStore } from "../store/fileTreeStore.js";
import type { ProjectSettings } from "../api/client.js";

function flattenBlueprintPaths(node: { type: string; relativePath: string; children?: any[] }): string[] {
  const paths: string[] = [];
  if (node.type === "file" && node.relativePath.endsWith(".blueprint")) {
    paths.push(node.relativePath);
  }
  if (node.children) {
    for (const child of node.children) {
      paths.push(...flattenBlueprintPaths(child));
    }
  }
  return paths;
}

export function SettingsModal() {
  const isSettingsOpen = useFlowStore((s) => s.isSettingsOpen);
  const projectSettings = useFlowStore((s) => s.projectSettings);
  const saveProjectSettings = useFlowStore((s) => s.saveProjectSettings);
  const closeSettings = useFlowStore((s) => s.closeSettings);
  const tree = useFileTreeStore((s) => s.tree);

  const [mode, setMode] = useState<"server" | "script">("server");
  const [entryFile, setEntryFile] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (projectSettings) {
      setMode(projectSettings.mode);
      setEntryFile(projectSettings.entryFile || "");
      setErrors([]);
    }
  }, [isSettingsOpen, projectSettings]);

  const blueprintPaths = tree.flatMap((node) => flattenBlueprintPaths(node)).sort();

  const handleSave = async () => {
    const validationErrors = await saveProjectSettings({
      mode,
      entryFile: entryFile || undefined,
    });
    if (validationErrors.length === 0) {
      closeSettings();
    } else {
      setErrors(validationErrors);
    }
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <div className="flex max-h-96 w-96 flex-col rounded-lg bg-neutral-900 p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-white">Project Settings</h2>

        <div className="mb-4 space-y-2 overflow-y-auto">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "server"}
                onChange={() => {
                  setMode("server");
                  setErrors([]);
                }}
                className="cursor-pointer"
              />
              <span className="text-sm text-neutral-100">Server</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "script"}
                onChange={() => {
                  setMode("script");
                  setErrors([]);
                }}
                className="cursor-pointer"
              />
              <span className="text-sm text-neutral-100">Script</span>
            </label>
          </div>

          {mode === "server" && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-neutral-300">
                Entry File (optional — auto-detect if empty)
              </label>
              <select
                value={entryFile}
                onChange={(e) => {
                  setEntryFile(e.target.value);
                  setErrors([]);
                }}
                className="mt-1 w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="">Auto-detect</option>
                {blueprintPaths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded bg-red-900/20 p-2">
              {errors.map((err, i) => (
                <div key={i} className="text-xs text-red-400">
                  {err}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={closeSettings}
            className="rounded border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
