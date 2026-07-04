import * as api from "../api/client.js";

export interface ResolvedFunction {
  requirePath: string;
  variableName: string;
  functionName: string;
  params: string;
}

export interface ResolvedRequireModule {
  variableName: string;
  requirePath: string;
  functions: ResolvedFunction[];
  error?: string;
  /**
   * True when this Require node is in npm mode (`data.sourceType === "npm"`) —
   * `requirePath` is a package name, not a `.blueprint` file, so it was never fetched
   * and `functions` is always empty here (not because the package has zero exports).
   * Defaults to falsy/omitted for the existing local-file path so no other caller breaks.
   */
  isNpm?: boolean;
}

function dirname(relativePath: string): string {
  const idx = relativePath.lastIndexOf("/");
  return idx === -1 ? "" : relativePath.slice(0, idx);
}

// Minimal POSIX path resolution (no Node "path" module in the browser) — mirrors
// packages/core/src/project/compile-project.ts's require-path resolution so a
// Require node's path here is interpreted exactly the way Compile will resolve it.
export function resolveRequireTarget(currentFilePath: string, requirePath: string): string {
  const combined = `${dirname(currentFilePath)}/${requirePath}`;
  const stack: string[] = [];
  for (const part of combined.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") stack.pop();
      else stack.push("..");
    } else {
      stack.push(part);
    }
  }
  return `${stack.join("/")}.blueprint`;
}

/**
 * Resolves what each `logic.require` node in the current file actually exposes — the
 * exported (Function -> Export-connected) functions of the target file. Shared by
 * RequiredModulesPanel (reference display), NodePickerMenu, and NodeBrowserModal
 * (virtual "Function Call" search entries) so the fetch+parse logic exists exactly once.
 */
export async function resolveRequiredFunctions(
  currentFilePath: string,
  requireNodes: Array<{ data?: Record<string, unknown> }>,
): Promise<ResolvedRequireModule[]> {
  return Promise.all(
    requireNodes.map(async (reqNode): Promise<ResolvedRequireModule> => {
      const requirePath = String(reqNode.data?.path ?? "").trim();
      const variableName = String(reqNode.data?.variableName ?? "").trim() || "(unnamed)";
      const isNpm = reqNode.data?.sourceType === "npm";
      if (!requirePath) {
        return { variableName, requirePath, functions: [], error: "No path configured", isNpm };
      }

      // npm packages aren't `.blueprint` files on disk — nothing to fetch or parse for
      // exported functions, unlike a local Require target.
      if (isNpm) {
        return { variableName, requirePath, functions: [], isNpm: true };
      }

      const targetPath = resolveRequireTarget(currentFilePath, requirePath);
      try {
        const targetFlow = await api.fetchBlueprint(targetPath);
        const exportNode = targetFlow.nodes.find((n) => n.type === "logic.export");
        const functions: ResolvedFunction[] = [];
        if (exportNode) {
          for (const edge of targetFlow.edges) {
            if (edge.target !== exportNode.id) continue;
            const source = targetFlow.nodes.find((n) => n.id === edge.source);
            if (source?.type === "logic.function") {
              functions.push({
                requirePath,
                variableName,
                functionName: String(source.data?.name ?? "?"),
                params: String(source.data?.params ?? ""),
              });
            }
          }
        }
        return { variableName, requirePath, functions };
      } catch (err) {
        return { variableName, requirePath, functions: [], error: (err as Error).message };
      }
    }),
  );
}
