/**
 * Shared npm package-name/version validation used by both `require.node.ts`'s `emit()` and
 * `compile-project.ts`'s cross-file validation pass, so the two can never disagree about
 * what counts as a valid npm-mode `logic.require` declaration.
 */

// Mirrors npm's own package name rules (lowercase, optional @scope/), but stays
// case-insensitive to avoid rejecting older still-resolvable mixed-case packages.
const NPM_PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

// Permissive: covers semver ranges (^1.2.3, ~1.2.3, >=1.0.0 <2.0.0), tags (latest), and "*".
// Blank is handled separately by callers (means "unpinned").
const NPM_VERSION_RE = /^[\w.\-^~*<>=|\s]+$/;

export function isValidNpmPackageName(name: string): boolean {
  return NPM_PACKAGE_NAME_RE.test(name);
}

export function isValidNpmVersion(version: string): boolean {
  return NPM_VERSION_RE.test(version);
}

export function parseDependencyEntry(entry: string): { packageName: string; version: string } | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  // Scoped packages ("@org/pkg@^1.0.0") have an "@" at index 0 that isn't a version separator;
  // only split on an "@" that appears after the package name starts.
  const searchFrom = trimmed.startsWith("@") ? trimmed.indexOf("/") : 0;
  const atIndex = trimmed.indexOf("@", Math.max(searchFrom, 1));

  const packageName = atIndex === -1 ? trimmed : trimmed.slice(0, atIndex);
  const version = atIndex === -1 ? "" : trimmed.slice(atIndex + 1).trim();
  return { packageName, version };
}
