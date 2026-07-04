// Runs editor-server + editor-ui together from a single command.
//
// This does NOT use `concurrently`: wrapping `tsx watch` (which forks its own child
// process to run the actual script) behind concurrently's piped stdio reliably breaks
// on Windows — the worker process starts but silently never reaches `app.listen()`,
// reproducible even with pnpm taken out of the chain entirely. `stdio: "inherit"` avoids
// that pipe layer altogether and behaves exactly like running each command in its own
// terminal, which is what actually works.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectDir = path.resolve(rootDir, process.argv[2] ?? process.env.FLOWSERVER_PROJECT_DIR ?? "./playground");

console.log(`[dev] Project directory: ${projectDir}`);

const isWindows = process.platform === "win32";
const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

const children = [
  spawn(pnpmCmd, ["--filter", "@flowserver/editor-server", "run", "dev"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: isWindows,
    env: { ...process.env, FLOWSERVER_PROJECT_DIR: projectDir },
  }),
  spawn(pnpmCmd, ["--filter", "@flowserver/editor-ui", "run", "dev"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: isWindows,
  }),
];

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let remaining = children.length;
for (const child of children) {
  child.on("exit", () => {
    remaining -= 1;
    if (remaining === 0) process.exit(0);
    // One process died — bring the other down too rather than leaving it orphaned.
    shutdown();
  });
}
