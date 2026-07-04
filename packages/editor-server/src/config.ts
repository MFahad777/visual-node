import path from "node:path";

export interface AppConfig {
  projectDir: string;
}

/**
 * Resolves the single project directory this server instance operates on:
 * first CLI arg, then FLOWSERVER_PROJECT_DIR, then cwd. This is a local,
 * single-project tool — no multi-project registry.
 */
export function resolveProjectDir(argv: string[] = process.argv.slice(2)): string {
  // `pnpm run dev -- <dir>` forwards a literal "--" through tsx watch into argv; skip it.
  const fromArg = argv.find((a) => a !== "--");
  const dir = fromArg ?? process.env.FLOWSERVER_PROJECT_DIR ?? process.cwd();
  return path.resolve(dir);
}
