#!/usr/bin/env node
import { buildApp } from "./app.js";
import { resolveProjectDir } from "./config.js";
import { loadInstalledPlugins } from "./plugin-loading.js";
import { ensurePluginReadme } from "./plugin-readme.js";
import { serverRunner } from "./runner.js";

const projectDir = resolveProjectDir();
const port = Number(process.env.PORT ?? 4000);

// Re-register any previously-installed plugin nodes (Phase 9 Part B) before the app is
// built, so they're already live for the very first GetNodeRegistry call. Deliberately kept
// here rather than inside buildApp()/app.ts: buildApp() is synchronous and constructed
// directly (without awaiting a plugin-load step) by every existing test in this package.
const { failed: failedPlugins } = await loadInstalledPlugins(projectDir);
for (const { file, error } of failedPlugins) {
  console.warn(`Failed to load plugin "${file}": ${error}`);
}

// Scaffold README.PLUGIN.md (write-once) so every project — new or pre-existing — has the
// plugin-authoring guide available without the user having to go looking for it.
await ensurePluginReadme(projectDir);

const app = buildApp({ projectDir });

app.listen(port, () => {
  console.log(`FlowServer editor running at http://localhost:${port}`);
  console.log(`Project directory: ${projectDir}`);
});

// Never leave an orphaned generated-server process running after editor-server exits.
// `stop()`'s kill() call is synchronous even though the returned promise resolves later —
// no need to await it here, and process.on("exit") handlers can't run async work anyway.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void serverRunner.stop();
    process.exit(0);
  });
}
