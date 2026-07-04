// Copies the repo's worked example flows into editor-server's dist, so the published
// `visual-node` npm package ships with them (see examples/README.md's `npx visual-node
// examples/...` instructions) and a user can find them under the installed package.
// Skips build.mjs — it only makes sense against a checked-out repo, since it imports
// from ../packages/core/dist relative to the repo root, not to an installed package.
// Runs as part of editor-server's `build` script, after `tsc`.
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const examplesDir = path.join(rootDir, "examples");
const target = path.join(rootDir, "packages/editor-server/dist/examples");

if (!existsSync(examplesDir)) {
  console.warn(`[copy-examples] ${examplesDir} does not exist — skipping.`);
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const entries = await readdir(examplesDir, { withFileTypes: true });
for (const entry of entries) {
  if (entry.name === "build.mjs") continue;
  await cp(path.join(examplesDir, entry.name), path.join(target, entry.name), {
    recursive: true,
  });
}

console.log(`[copy-examples] Copied ${examplesDir} -> ${target}`);
