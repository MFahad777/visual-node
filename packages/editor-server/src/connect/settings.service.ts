import path from "node:path";
import type { ConnectRouter } from "@connectrpc/connect";
import { EditorService } from "@visual-node/proto-gen";
import type { AppConfig } from "../config.js";
import { readProjectSettings, writeProjectSettings } from "../project-settings.js";
import { resolveSafePath } from "../path-safety.js";

export function registerSettingsRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  async function getProjectSettings() {
    const settings = await readProjectSettings(config.projectDir);
    return { settings };
  }

  async function updateProjectSettings(req: { settings?: { mode?: string; entryFile?: string } }) {
    const errors: string[] = [];
    const settings = req.settings;

    if (!settings) {
      errors.push("settings is required");
      return { ok: false, errors };
    }

    const mode = settings.mode || "";
    if (mode !== "server" && mode !== "script") {
      errors.push(`Invalid mode: "${mode}" (must be "server" or "script")`);
    }

    if (mode === "server" && settings.entryFile) {
      if (!settings.entryFile.endsWith(".blueprint")) {
        errors.push(`Entry file must end in .blueprint (got: "${settings.entryFile}")`);
      }

      const resolved = resolveSafePath(config.projectDir, settings.entryFile);
      if (!resolved) {
        errors.push(`Unsafe or out-of-bounds path: "${settings.entryFile}"`);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const result = await writeProjectSettings(config.projectDir, {
      mode: mode as "server" | "script",
      entryFile: settings.entryFile || undefined,
    });

    return { ok: result.ok, errors: result.errors };
  }

  router.rpc(EditorService.method.getProjectSettings, getProjectSettings);
  router.rpc(EditorService.method.updateProjectSettings, updateProjectSettings);

  return router;
}
