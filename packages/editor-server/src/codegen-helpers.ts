import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compileProject,
  decodeFlow,
  emitExpress,
  formatCode,
  validateFlow,
  type Flow,
  type ProjectCompileResult,
  type ProjectFile,
  type ProjectFileError,
  type ValidationError,
} from "@flowserver/core";
import { listBlueprintFiles } from "./file-tree.js";

const EXPRESS_DEPENDENCY_VERSION = "^4.19.2";

export type CompileResult = { valid: true; code: string } | { valid: false; errors: ValidationError[] };

export async function compile(flow: Flow): Promise<CompileResult> {
  const validation = validateFlow(flow);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors };
  }
  const { code } = emitExpress(flow);
  const formatted = await formatCode(code);
  return { valid: true, code: formatted };
}

export interface ProjectCompileFromDisk {
  /** The raw, parsed `.blueprint` sources read from disk — same order as `result.files` when `result.valid`. */
  sourceFiles: ProjectFile[];
  result: ProjectCompileResult;
}

/**
 * Reads every `.blueprint` file in the project, parses it, and runs core's project-wide
 * `compileProject`. A read/parse failure on an individual file becomes a per-file error
 * (excluded from the compiled batch) rather than 500ing the whole request. Shared by
 * `/api/compile` and `/api/run/start` — both need "the whole project, compiled from disk",
 * not just whatever flow happens to be open in the canvas.
 */
export async function compileProjectFromDisk(projectDir: string): Promise<ProjectCompileFromDisk> {
  const blueprintRefs = await listBlueprintFiles(projectDir);
  const files: ProjectFile[] = [];
  const readErrors: ProjectFileError[] = [];

  for (const ref of blueprintRefs) {
    const absolutePath = path.join(projectDir, ref.relativePath);
    let raw: Buffer;
    try {
      raw = await readFile(absolutePath);
    } catch (err) {
      readErrors.push({ relativePath: ref.relativePath, message: `Failed to read file: ${(err as Error).message}` });
      continue;
    }

    try {
      const flow = decodeFlow(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
      files.push({ relativePath: ref.relativePath, flow });
    } catch (err) {
      readErrors.push({ relativePath: ref.relativePath, message: `Failed to decode: ${(err as Error).message}` });
    }
  }

  const result = await compileProject(files);

  if (readErrors.length === 0) return { sourceFiles: files, result };
  if (result.valid) return { sourceFiles: files, result: { valid: false, errors: readErrors } };
  return { sourceFiles: files, result: { valid: false, errors: [...readErrors, ...result.errors] } };
}

/**
 * Finds the one file in the project responsible for starting the server — the file whose
 * flow contains an "express.listen" node. That's the file "Run Server" needs to spawn;
 * everything else (helpers required by it) just needs to be written to disk alongside it.
 */
export function findEntryFile(sourceFiles: ProjectFile[]): ProjectFile | { error: string } {
  const candidates = sourceFiles.filter((f) => f.flow.nodes.some((n) => n.type === "express.listen"));
  if (candidates.length === 0) {
    return { error: 'No file in this project has an "express.listen" node yet — nothing to run.' };
  }
  if (candidates.length > 1) {
    return {
      error: `Multiple files call "express.listen" (${candidates
        .map((f) => f.relativePath)
        .join(", ")}) — only one entry file is supported.`,
    };
  }
  return candidates[0];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes (or merges into) a CommonJS package.json in `projectDir`. Required for the
 * generated `server.js` (which uses `require`) to run correctly with plain
 * `node server.js` — without it, an ancestor directory's "type": "module" (or no manifest
 * at all) can make Node misidentify the file's module type. Declaring dependencies (not
 * just omitting `type: module`) is what makes `npm install && node server.js` actually
 * work, instead of leaving the user to guess what to install.
 *
 * Unlike the original write-once behavior, this now merges on every call: an existing
 * package.json's fields (including any hand-edited `dependencies` entries) are preserved,
 * `express` is added only if missing, and `options.dependencies` (the flow/project's
 * collected npm-mode `logic.require`/Custom Code declarations — see
 * `@flowserver/core`'s `collectFlowDependencies`/`collectProjectDependencies`) is merged in
 * without ever downgrading/overwriting an already-pinned real version. A dependency
 * key is only written/updated when it's currently absent or currently the placeholder
 * `"*"` (an earlier compile's "unpinned" marker) — a real pinned version a user hand-edited
 * in always wins.
 */
export async function ensureCommonJsPackageJson(
  projectDir: string,
  name: string,
  options?: { dependencies?: Record<string, string> },
): Promise<void> {
  const pkgPath = path.join(projectDir, "package.json");

  let manifest: Record<string, any>;
  if (await pathExists(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, "utf8");
      manifest = { ...JSON.parse(raw) };
    } catch {
      manifest = { name, private: true };
    }
  } else {
    manifest = { name, private: true };
  }

  const dependencies: Record<string, string> = { ...(manifest.dependencies ?? {}) };
  if (!dependencies.express) {
    dependencies.express = EXPRESS_DEPENDENCY_VERSION;
  }
  for (const [pkg, version] of Object.entries(options?.dependencies ?? {})) {
    if (!dependencies[pkg] || dependencies[pkg] === "*") {
      dependencies[pkg] = version;
    }
  }
  manifest.dependencies = dependencies;

  await writeFile(pkgPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export async function nodeModulesInstalled(projectDir: string): Promise<{ installed: boolean; missing: string[] }> {
  const pkgPath = path.join(projectDir, "package.json");
  let dependencies: Record<string, string> = {};
  try {
    const raw = await readFile(pkgPath, "utf8");
    dependencies = JSON.parse(raw).dependencies ?? {};
  } catch {
    dependencies = {};
  }

  const missing: string[] = [];
  for (const pkg of Object.keys(dependencies)) {
    if (!(await pathExists(path.join(projectDir, "node_modules", pkg)))) {
      missing.push(pkg);
    }
  }

  return { installed: missing.length === 0, missing };
}
