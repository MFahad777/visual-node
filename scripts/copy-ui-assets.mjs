// Copies editor-ui's built assets into editor-server's dist/public, so the published
// `visual-node` npm package is self-contained (see static.ts's candidate-path lookup).
// Runs as part of editor-server's `build` script, after `tsc`.
import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const uiDist = path.join(rootDir, "packages/editor-ui/dist");
const target = path.join(rootDir, "packages/editor-server/dist/public");

if (!existsSync(uiDist)) {
  console.warn(
    `[copy-ui-assets] ${uiDist} does not exist (editor-ui not built yet) — skipping. ` +
      "editor-server will run in API-only mode until editor-ui is built and this script re-run.",
  );
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await cp(uiDist, target, { recursive: true });
console.log(`[copy-ui-assets] Copied ${uiDist} -> ${target}`);
