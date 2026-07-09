import { create } from "zustand";
import * as api from "../api/client.js";
import type { FileTreeNode } from "../api/client.js";
import { useFlowStore } from "./flowStore.js";

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

export interface FileTreeState {
  tree: FileTreeNode[];
  isLoading: boolean;
  lastError: string | null;
  expandedPaths: Set<string>;

  refreshTree: () => Promise<void>;
  toggleExpanded: (path: string) => void;
  collapseAll: () => void;
  createFolder: (parentPath: string, name: string) => Promise<boolean>;
  createBlueprint: (parentPath: string, name: string) => Promise<string | null>;
  renamePath: (from: string, to: string) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  tree: [],
  isLoading: false,
  lastError: null,
  expandedPaths: new Set<string>(),

  refreshTree: async () => {
    set({ isLoading: true, lastError: null });
    try {
      const tree = await api.fetchFileTree();
      set({ tree, isLoading: false });
    } catch (err) {
      set({ isLoading: false, lastError: (err as Error).message });
    }
  },

  toggleExpanded: (path) => {
    const next = new Set(get().expandedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set({ expandedPaths: next });
  },

  collapseAll: () => set({ expandedPaths: new Set() }),

  createFolder: async (parentPath, name) => {
    const path = joinPath(parentPath, name);
    try {
      await api.createFolder(path);
      await get().refreshTree();
      useFlowStore.getState().bumpProjectRevision();
      return true;
    } catch (err) {
      set({ lastError: (err as Error).message });
      return false;
    }
  },

  createBlueprint: async (parentPath, name) => {
    const path = joinPath(parentPath, name);
    try {
      const result = await api.createBlueprint(path);
      await get().refreshTree();
      useFlowStore.getState().bumpProjectRevision();
      return result.path;
    } catch (err) {
      set({ lastError: (err as Error).message });
      return null;
    }
  },

  renamePath: async (from, to) => {
    try {
      await api.renameFile(from, to);
      await get().refreshTree();
      useFlowStore.getState().bumpProjectRevision();
      return true;
    } catch (err) {
      set({ lastError: (err as Error).message });
      return false;
    }
  },

  deletePath: async (path) => {
    try {
      await api.deleteFile(path);
      await get().refreshTree();
      const flowStore = useFlowStore.getState();
      if (flowStore.currentFilePath === path || flowStore.currentFilePath?.startsWith(`${path}/`)) {
        flowStore.closeFile();
      }
      flowStore.bumpProjectRevision();
      return true;
    } catch (err) {
      set({ lastError: (err as Error).message });
      return false;
    }
  },
}));
