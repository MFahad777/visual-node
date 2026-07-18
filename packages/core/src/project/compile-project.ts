import path from "node:path";
import { emitExpress } from "../codegen/emit-express.js";
import { formatCode } from "../codegen/formatter.js";
import { isValidNpmPackageName } from "../nodes/logic/npm-dependency.js";
import type { Flow, FlowNode } from "../schema/node.types.js";
import type { Diagnostic } from "../schema/diagnostics.js";
import { NestedGraphError } from "../codegen/nested-graph-error.js";

export interface ProjectFile {
  /** POSIX-style path relative to the project root, e.g. "helpers/dateFormater.blueprint". */
  relativePath: string;
  flow: Flow;
}

export interface ProjectFileError extends Diagnostic {
  relativePath: string;
}

export interface CompiledProjectFile {
  /** POSIX-style output path relative to the project root, e.g. "helpers/dateFormater.js". */
  relativePath: string;
  code: string;
}

export type ProjectCompileResult =
  | { valid: true; files: CompiledProjectFile[]; warnings: ProjectFileError[] }
  | { valid: false; errors: ProjectFileError[]; warnings: ProjectFileError[] };

function normalize(p: string): string {
  return p.replace(/\\/g, "/");
}

function withoutExtension(relativePath: string): string {
  return normalize(relativePath).replace(/\.blueprint$/, "");
}

function deriveOutputPath(relativePath: string): string {
  const norm = normalize(relativePath);
  if (!norm.endsWith(".blueprint")) {
    throw new Error(`Expected a ".blueprint" file path, got "${relativePath}"`);
  }
  return norm.slice(0, -".blueprint".length) + ".js";
}

/**
 * Compiles an entire project (multiple flow files that may `require()` each other) into
 * generated JS files. Pure function over already-loaded data — no filesystem access here;
 * callers (editor-server) are responsible for reading `.blueprint` files in and writing
 * `.js` files out.
 */
export async function compileProject(files: ProjectFile[]): Promise<ProjectCompileResult> {
  const byKey = new Map(files.map((f) => [withoutExtension(f.relativePath), f]));
  const errors: ProjectFileError[] = [];

  // Cross-file check: every logic.require path must resolve to a file in this project.
  // This is the one check core cannot do inside single-flow validateFlow() — it has no
  // notion of sibling files, so it belongs here at the project level instead.
  for (const file of files) {
    const fileDir = path.posix.dirname(normalize(file.relativePath));
    for (const node of file.flow.nodes as FlowNode[]) {
      if (node.type !== "logic.require") continue;
      const requirePath = String(node.data?.path ?? "").trim();
      if (!requirePath) continue; // reported separately by emitExpress's own validation

      if (node.data?.sourceType === "npm") {
        if (!isValidNpmPackageName(requirePath)) {
          errors.push({
            relativePath: file.relativePath,
            severity: "error",
            message: `Require node declares an invalid npm package name "${requirePath}"`,
            path: [{ nodeId: node.id, nodeType: node.type, label: "Require" }],
          });
        }
        continue;
      }

      const resolved = path.posix.normalize(path.posix.join(fileDir, requirePath));
      if (!byKey.has(resolved)) {
        errors.push({
          relativePath: file.relativePath,
          severity: "error",
          message: `Require path "${requirePath}" does not resolve to any ".blueprint" file in this project (resolved to "${resolved}")`,
          path: [{ nodeId: node.id, nodeType: node.type, label: "Require" }],
        });
      }
    }
  }

  // Per-file structural validation + emit, reusing emitExpress (which re-validates
  // internally). Collect ALL files' errors instead of stopping at the first, so the
  // caller can show every broken file in one pass.
  const compiled: CompiledProjectFile[] = [];
  const warnings: ProjectFileError[] = [];
  for (const file of files) {
    try {
      const { code, warnings: fileWarnings } = emitExpress(file.flow);
      const formatted = await formatCode(code);
      compiled.push({ relativePath: deriveOutputPath(file.relativePath), code: formatted });
      for (const w of fileWarnings) {
        warnings.push({ ...w, relativePath: file.relativePath });
      }
    } catch (err) {
      if (err instanceof NestedGraphError) {
        errors.push({ relativePath: file.relativePath, severity: "error", message: err.message, path: err.path });
      } else {
        errors.push({ relativePath: file.relativePath, severity: "error", message: err instanceof Error ? err.message : String(err), path: [] });
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };
  return { valid: true, files: compiled, warnings };
}
