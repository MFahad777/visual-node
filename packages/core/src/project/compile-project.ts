import path from "node:path";
import { emitExpress } from "../codegen/emit-express.js";
import { formatCode } from "../codegen/formatter.js";
import { FunctionBodyGraphError } from "../nodes/logic/function.node.js";
import { isValidNpmPackageName } from "../nodes/logic/npm-dependency.js";
import type { Flow, FlowNode } from "../schema/node.types.js";

export interface ProjectFile {
  /** POSIX-style path relative to the project root, e.g. "helpers/dateFormater.blueprint". */
  relativePath: string;
  flow: Flow;
}

export interface ProjectFileError {
  relativePath: string;
  nodeId?: string;
  /** Set when the error originated inside a Function node's blueprint body graph, pointing at the specific node within it. */
  blueprintNodeId?: string;
  message: string;
}

export interface CompiledProjectFile {
  /** POSIX-style output path relative to the project root, e.g. "helpers/dateFormater.js". */
  relativePath: string;
  code: string;
}

export type ProjectCompileResult =
  | { valid: true; files: CompiledProjectFile[] }
  | { valid: false; errors: ProjectFileError[] };

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
            nodeId: node.id,
            message: `Require node declares an invalid npm package name "${requirePath}"`,
          });
        }
        continue;
      }

      const resolved = path.posix.normalize(path.posix.join(fileDir, requirePath));
      if (!byKey.has(resolved)) {
        errors.push({
          relativePath: file.relativePath,
          nodeId: node.id,
          message: `Require path "${requirePath}" does not resolve to any ".blueprint" file in this project (resolved to "${resolved}")`,
        });
      }
    }
  }

  // Per-file structural validation + emit, reusing emitExpress (which re-validates
  // internally). Collect ALL files' errors instead of stopping at the first, so the
  // caller can show every broken file in one pass.
  const compiled: CompiledProjectFile[] = [];
  for (const file of files) {
    try {
      const { code } = emitExpress(file.flow);
      const formatted = await formatCode(code);
      compiled.push({ relativePath: deriveOutputPath(file.relativePath), code: formatted });
    } catch (err) {
      if (err instanceof FunctionBodyGraphError) {
        errors.push({
          relativePath: file.relativePath,
          nodeId: err.functionNodeId,
          blueprintNodeId: err.blueprintNodeId,
          message: err.message,
        });
      } else {
        errors.push({ relativePath: file.relativePath, message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, files: compiled };
}
