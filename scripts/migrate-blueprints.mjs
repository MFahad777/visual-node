#!/usr/bin/env node
// One-time migration: converts every `.blueprint` file in a FlowServer project directory
// from its pre-Phase-8 plain-JSON on-disk format to the new FlatBuffers/FlexBuffers binary
// format (see docs/phase8-backend-grpc-flatbuffers-plan.md). The `.blueprint` extension
// itself is unchanged — only the bytes inside each file change — so this is a content
// rewrite in place, not a rename.
//
// Idempotent and safe to re-run: any file that already decodes as FlatBuffers (i.e. already
// migrated) is left untouched. Files that are neither valid JSON nor valid FlatBuffers are
// reported and skipped rather than guessed at.
//
// Usage: node scripts/migrate-blueprints.mjs <project-dir> [--dry-run]

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadCore() {
  // Import core's built output directly rather than depending on a published package
  // resolution context, since this script may be run standalone from the repo root.
  const corePath = path.join(__dirname, "..", "packages", "core", "dist", "index.js");
  return import(pathToFileURL(corePath).href);
}

async function findBlueprintFiles(dir) {
  const results = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".blueprint")) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const projectDir = args.find((a) => !a.startsWith("--"));

  if (!projectDir) {
    console.error("Usage: node scripts/migrate-blueprints.mjs <project-dir> [--dry-run]");
    process.exit(1);
  }

  const { encodeFlow, decodeFlow } = await loadCore();
  const files = await findBlueprintFiles(path.resolve(projectDir));

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (const file of files) {
    const raw = await readFile(file);
    const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);

    // Already in the new format?
    try {
      decodeFlow(bytes);
      alreadyMigrated++;
      console.log(`skip (already migrated): ${file}`);
      continue;
    } catch {
      // Not FlatBuffers — fall through and try JSON.
    }

    let flow;
    try {
      flow = JSON.parse(raw.toString("utf8"));
    } catch (err) {
      failed++;
      console.error(`FAIL (neither valid FlatBuffers nor valid JSON): ${file} — ${err.message}`);
      continue;
    }

    const encoded = encodeFlow(flow);
    if (dryRun) {
      console.log(`would migrate: ${file} (${raw.length} bytes JSON -> ${encoded.length} bytes FlatBuffers)`);
    } else {
      await writeFile(file, encoded);
      console.log(`migrated: ${file} (${raw.length} bytes JSON -> ${encoded.length} bytes FlatBuffers)`);
    }
    migrated++;
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}Done: ${migrated} migrated, ${alreadyMigrated} already migrated, ${failed} failed, ${files.length} total .blueprint files.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
