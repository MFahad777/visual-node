import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createPluginNodeDefinition,
  getNodeDefinition,
  registerNode,
  validatePluginNodeSpec,
  type PluginNodeSpec,
} from "@visual-node/core";

export interface LoadInstalledPluginsResult {
  /** `type` of each plugin successfully (re-)registered. */
  loaded: string[];
  /** One entry per `.node.json` file that failed to parse/validate — the rest are still processed. */
  failed: { file: string; error: string }[];
}

/**
 * Re-registers every previously-installed plugin node (Phase 9 Part B) on startup, from
 * `<projectDir>/.visualnode/plugins/*.node.json` — mirrors `registerBuiltinNodes()`'s own
 * "skip if already registered" idempotency guard (see packages/core/src/nodes/index.ts), so
 * this stays safe to call more than once. A missing `.visualnode/plugins` directory (no
 * plugins ever installed) is treated as "nothing to load", not an error. A single malformed
 * or invalid file is recorded in `failed` and does not abort loading the rest.
 */
export async function loadInstalledPlugins(projectDir: string): Promise<LoadInstalledPluginsResult> {
  const pluginsDir = path.join(projectDir, ".visualnode", "plugins");

  let entries: string[];
  try {
    entries = await readdir(pluginsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { loaded: [], failed: [] };
    }
    throw err;
  }

  const loaded: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const file of entries.filter((name) => name.endsWith(".node.json")).sort()) {
    const absolutePath = path.join(pluginsDir, file);
    try {
      const raw = JSON.parse(await readFile(absolutePath, "utf8"));
      const errors = validatePluginNodeSpec(raw);
      if (errors.length > 0) {
        failed.push({ file, error: errors.join("; ") });
        continue;
      }
      const spec = raw as PluginNodeSpec;
      if (!getNodeDefinition(spec.type)) {
        registerNode(createPluginNodeDefinition(spec));
      }
      loaded.push(spec.type);
    } catch (err) {
      failed.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { loaded, failed };
}
