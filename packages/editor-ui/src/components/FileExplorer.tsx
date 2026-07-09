import { useEffect, useState } from "react";
import type { FileTreeNode } from "../api/client.js";
import { useFileTreeStore } from "../store/fileTreeStore.js";
import { useFlowStore } from "../store/flowStore.js";
import { useResize } from "../hooks/useResize.js";
import { ResizeHandle } from "./ResizeHandle.js";

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

interface FileTreeRowProps {
  node: FileTreeNode;
  depth: number;
  selectedFolderPath: string | null;
  onSelectFolder: (path: string) => void;
}

function FileTreeRow({ node, depth, selectedFolderPath, onSelectFolder }: FileTreeRowProps) {
  const expandedPaths = useFileTreeStore((s) => s.expandedPaths);
  const toggleExpanded = useFileTreeStore((s) => s.toggleExpanded);
  const renamePath = useFileTreeStore((s) => s.renamePath);
  const deletePath = useFileTreeStore((s) => s.deletePath);
  const currentFilePath = useFlowStore((s) => s.currentFilePath);
  const openFile = useFlowStore((s) => s.openFile);

  const paddingLeft = depth * 12;

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = window.prompt("Rename to:", node.name);
    if (!next || next === node.name) return;
    const to = joinPath(parentOf(node.relativePath), next);
    void renamePath(node.relativePath, to);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const message =
      node.type === "folder"
        ? `Delete folder "${node.name}" and everything inside it?`
        : `Delete file "${node.name}"?`;
    if (window.confirm(message)) void deletePath(node.relativePath);
  };

  if (node.type === "folder") {
    const isExpanded = expandedPaths.has(node.relativePath);
    const isSelected = selectedFolderPath === node.relativePath;

    return (
      <div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(node.relativePath);
            onSelectFolder(node.relativePath);
          }}
          style={{ paddingLeft }}
          className={`group flex cursor-pointer items-center gap-1 py-1 pr-2 text-xs hover:bg-neutral-700 ${isSelected ? "bg-neutral-700/70" : ""}`}
        >
          <span className="w-3 shrink-0 text-neutral-400">{isExpanded ? "▾" : "▸"}</span>
          <span className="truncate text-neutral-200">{node.name}</span>
          <span className="ml-auto flex shrink-0 gap-1.5 opacity-0 group-hover:opacity-100">
            <button
              onClick={handleRename}
              title="Rename"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-100"
            >
              ✎
            </button>
            <button
              onClick={handleDelete}
              title="Delete"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:text-red-400"
            >
              🗑
            </button>
          </span>
        </div>
        {isExpanded &&
          node.children.map((child) => (
            <FileTreeRow
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              selectedFolderPath={selectedFolderPath}
              onSelectFolder={onSelectFolder}
            />
          ))}
      </div>
    );
  }

  const isBlueprint = node.name.endsWith(".blueprint");
  const isSelected = node.relativePath === currentFilePath;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (isBlueprint) void openFile(node.relativePath);
      }}
      style={{ paddingLeft: paddingLeft + 14 }}
      className={`group flex items-center gap-1 py-1 pr-2 text-xs ${isBlueprint ? "cursor-pointer hover:bg-neutral-700" : "cursor-default opacity-50"} ${isSelected ? "bg-sky-700/40" : ""}`}
    >
      <span className="truncate text-neutral-200">{node.name}</span>
      <span className="ml-auto flex shrink-0 gap-1.5 opacity-0 group-hover:opacity-100">
        <button
          onClick={handleRename}
          title="Rename"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-100"
        >
          ✎
        </button>
        <button
          onClick={handleDelete}
          title="Delete"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:text-red-400"
        >
          🗑
        </button>
      </span>
    </div>
  );
}

export function FileExplorer() {
  const tree = useFileTreeStore((s) => s.tree);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const collapseAll = useFileTreeStore((s) => s.collapseAll);
  const createFolder = useFileTreeStore((s) => s.createFolder);
  const createBlueprint = useFileTreeStore((s) => s.createBlueprint);
  const lastError = useFileTreeStore((s) => s.lastError);
  const openFile = useFlowStore((s) => s.openFile);

  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const { size: width, onMouseDown } = useResize({ initial: 224, min: 160, max: 480, axis: "x" });

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  const handleNewFile = async () => {
    const input = window.prompt("File name (e.g. server.blueprint):");
    if (!input) return;
    const name = input.trim();
    if (!name) return;
    const fileName = name.endsWith(".blueprint") ? name : `${name}.blueprint`;
    const created = await createBlueprint(selectedFolderPath ?? "", fileName);
    if (created) void openFile(created);
  };

  const handleNewFolder = async () => {
    const input = window.prompt("Folder name:");
    if (!input) return;
    const name = input.trim();
    if (!name) return;
    await createFolder(selectedFolderPath ?? "", name);
  };

  return (
    <div className="flex h-full shrink-0" style={{ width }}>
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto border-r border-black/60 bg-[#1f1f1f]">
        <div className="flex items-center justify-between px-3 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Explorer</h2>
          <div className="flex gap-1.5 text-[11px] text-neutral-400">
            <button onClick={handleNewFile} title="New File" className="flex h-6 items-center rounded px-1 hover:text-neutral-100">
              +File
            </button>
            <button onClick={handleNewFolder} title="New Folder" className="flex h-6 items-center rounded px-1 hover:text-neutral-100">
              +Folder
            </button>
            <button onClick={() => refreshTree()} title="Refresh" className="flex h-6 w-6 items-center justify-center rounded hover:text-neutral-100">
              ⟳
            </button>
            <button onClick={collapseAll} title="Collapse All" className="flex h-6 w-6 items-center justify-center rounded hover:text-neutral-100">
              ⊟
            </button>
          </div>
        </div>

        {lastError && <p className="px-3 pt-1 text-[11px] text-red-400">{lastError}</p>}

        <div
          onClick={() => setSelectedFolderPath(null)}
          className={`mt-2 flex-1 ${selectedFolderPath === null ? "bg-neutral-800/40" : ""}`}
        >
          {tree.map((node) => (
            <FileTreeRow
              key={node.relativePath}
              node={node}
              depth={0}
              selectedFolderPath={selectedFolderPath}
              onSelectFolder={setSelectedFolderPath}
            />
          ))}
        </div>
      </div>
      <ResizeHandle axis="x" onMouseDown={onMouseDown} />
    </div>
  );
}
