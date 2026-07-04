import { readdir } from "node:fs/promises";
import path from "node:path";

export interface FileTreeFileNode {
  type: "file";
  name: string;
  relativePath: string;
}

export interface FileTreeFolderNode {
  type: "folder";
  name: string;
  relativePath: string;
  children: FileTreeNode[];
}

export type FileTreeNode = FileTreeFileNode | FileTreeFolderNode;

const IGNORED = new Set(["node_modules", ".git"]);

/**
 * Lists the whole project directory as a tree, excluding node_modules/.git/dotfiles.
 * Shows *all* remaining files (not just `.blueprint`) so the tree reflects the real
 * directory — the UI only treats `.blueprint` files as openable. Folders sort before
 * files, alphabetical within each group.
 */
export async function listTree(projectDir: string): Promise<FileTreeNode[]> {
  return listDir(projectDir, "");
}

async function listDir(absoluteDir: string, relativeDir: string): Promise<FileTreeNode[]> {
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const nodes: FileTreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
    // Built manually with "/" (not path.join) so relativePath stays POSIX-style even on
    // Windows, matching core's compileProject path contract.
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      nodes.push({
        type: "folder",
        name: entry.name,
        relativePath,
        children: await listDir(path.join(absoluteDir, entry.name), relativePath),
      });
    } else {
      nodes.push({ type: "file", name: entry.name, relativePath });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return nodes;
}

/** Flat list of every ".blueprint" file's relative path, for /api/compile. */
export async function listBlueprintFiles(projectDir: string): Promise<{ relativePath: string }[]> {
  const results: { relativePath: string }[] = [];
  const walk = (nodes: FileTreeNode[]) => {
    for (const n of nodes) {
      if (n.type === "file" && n.name.endsWith(".blueprint")) results.push({ relativePath: n.relativePath });
      if (n.type === "folder") walk(n.children);
    }
  };
  walk(await listTree(projectDir));
  return results;
}
