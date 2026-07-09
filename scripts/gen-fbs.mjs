// Compiles packages/core/src/schema/flow.fbs into TypeScript FlatBuffers bindings under
// packages/core/src/schema/generated/.
//
// Uses `flatc-wasm` (the flatc compiler built to WebAssembly) purely in-process — no
// subprocess spawn, so none of scripts/dev.mjs's Windows "spawning a native binary needs
// shell: true" gotchas apply here. FlatcRunner.generateCode() runs entirely inside the
// WASM module and returns a { filename: content } map we just write to disk.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = path.join(rootDir, "packages/core/src/schema/flow.fbs");
const outDir = path.join(rootDir, "packages/core/src/schema/generated");

// `flatc-wasm` is a devDependency of packages/core (pnpm workspace: not hoisted to the
// root node_modules), while this script lives at the repo root. Rather than making the
// root package.json depend on a package it doesn't otherwise need, resolve flatc-wasm's
// real ESM entry point inside packages/core's own node_modules and import it directly by
// URL. This is a pure in-process WASM API call (FlatcRunner never shells out), so unlike
// scripts/dev.mjs's native-binary spawns there is no Windows `shell: true` concern here.
const flatcWasmEntry = pathToFileURL(
  path.join(rootDir, "packages/core/node_modules/flatc-wasm/src/index.mjs"),
).href;

async function main() {
  const { FlatcRunner } = await import(flatcWasmEntry);
  const flatc = await FlatcRunner.init();
  console.log(`[fbs:gen] ${flatc.version()}`);

  const schemaSource = readFileSync(schemaPath, "utf8");
  const schemaInput = {
    entry: "/flow.fbs",
    files: {
      "/flow.fbs": schemaSource,
    },
  };

  const files = flatc.generateCode(schemaInput, "ts", {
    tsNoImportExt: false,
  });

  mkdirSync(outDir, { recursive: true });

  const written = [];
  for (const [filename, content] of Object.entries(files)) {
    // flatc emits paths like "visual-node/fbs/flow-node.ts" (namespace-derived dirs) —
    // preserve the relative structure under outDir.
    const outPath = path.join(outDir, filename);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, content, "utf8");
    written.push(outPath);
  }

  if (written.length === 0) {
    throw new Error("flatc produced no output files — check flow.fbs for schema errors");
  }

  console.log(`[fbs:gen] wrote ${written.length} file(s) to ${outDir}`);
  for (const f of written) console.log(`  ${path.relative(rootDir, f)}`);
}

main().catch((err) => {
  console.error("[fbs:gen] failed:", err);
  process.exit(1);
});
