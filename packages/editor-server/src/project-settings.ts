import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ProjectSettings {
  mode: "server" | "script";
  entryFile?: string;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  mode: "server",
};

export const SETTINGS_FILENAME = "visual-node-project-settings.json";

export async function readProjectSettings(projectDir: string): Promise<ProjectSettings> {
  const settingsPath = path.join(projectDir, SETTINGS_FILENAME);
  try {
    const raw = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const settings = parsed as Record<string, unknown>;
      if (typeof settings.mode === "string" && (settings.mode === "server" || settings.mode === "script")) {
        return {
          mode: settings.mode,
          entryFile: typeof settings.entryFile === "string" ? settings.entryFile : undefined,
        };
      }
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeProjectSettings(projectDir: string, settings: ProjectSettings): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (settings.mode !== "server" && settings.mode !== "script") {
    errors.push(`Invalid mode: "${settings.mode}" (must be "server" or "script")`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  try {
    const settingsPath = path.join(projectDir, SETTINGS_FILENAME);
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
    return { ok: true, errors: [] };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}
