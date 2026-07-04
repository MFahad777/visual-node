// Compiles every example's flow.json into a real .blueprint binary (openable directly by
// `visual-node`) and a compiled server.js (committed alongside so a reader can see the
// output without running anything). Run after `pnpm -r run build` from the repo root:
//
//   node examples/build.mjs
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emitExpress,
  formatCode,
  validateFlow,
  writeFlowFile,
} from "../packages/core/dist/index.js";

const examplesDir = path.dirname(fileURLToPath(import.meta.url));

const entries = await readdir(examplesDir, { withFileTypes: true });
const exampleDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

for (const dirName of exampleDirs) {
  const dir = path.join(examplesDir, dirName);
  const flowJsonPath = path.join(dir, "flow.json");

  let raw;
  try {
    raw = await readFile(flowJsonPath, "utf8");
  } catch {
    continue; // no flow.json in this folder — not an example, skip it
  }

  const flow = JSON.parse(raw);

  const validation = validateFlow(flow);
  if (!validation.valid) {
    console.error(`[examples/build] ${dirName}: flow is invalid:`);
    for (const err of validation.errors) {
      console.error(`  ${err.nodeId ? `[${err.nodeId}] ` : ""}${err.message}`);
    }
    process.exitCode = 1;
    continue;
  }

  const { code } = emitExpress(flow);
  const formatted = await formatCode(code);
  await writeFile(path.join(dir, "server.js"), formatted, "utf8");

  await writeFlowFile(path.join(dir, "flow.blueprint"), flow);

  console.log(`[examples/build] ${dirName}: wrote server.js + flow.blueprint`);
}
