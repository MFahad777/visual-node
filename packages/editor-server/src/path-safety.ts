import path from "node:path";

/**
 * Resolves a client-supplied, project-relative path to an absolute filesystem path,
 * refusing anything that could escape `projectDir`. This is the first place in the
 * codebase that accepts a client-supplied path (every existing route only ever builds
 * paths from fixed literals), so real protection is required here.
 *
 * Rejects `..` segments and absolute paths (POSIX or Windows-drive-letter) outright, then
 * re-verifies the resolved path is still inside `projectDir` as defense in depth. Symlink
 * resolution (`fs.realpath`) is deliberately skipped — this is a single-user local tool
 * with one trusted project directory, not a multi-tenant service.
 */
export function resolveSafePath(projectDir: string, relativePath: string): string | null {
  if (typeof relativePath !== "string" || relativePath.length === 0) return null;
  if (path.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) return null;
  if (relativePath.split(/[\\/]/).some((seg) => seg === "..")) return null;
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
