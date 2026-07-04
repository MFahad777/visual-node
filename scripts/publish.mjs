// Publishes @visual-node/core -> @visual-node/proto-gen -> visual-node (editor-server) to
// the npm registry, in that dependency order (visual-node depends on the other two; pnpm
// rewrites their `workspace:*` ranges to the real published version automatically).
//
// Usage:
//   node scripts/publish.mjs            # the real thing — publishes for real
//   node scripts/publish.mjs --dry-run  # runs `pnpm publish --dry-run` for every package,
//                                        # touches nothing on the registry
//
// Requires `npm login` to have already been run interactively on this machine — this
// script refuses to proceed otherwise, since `pnpm publish` would just fail anyway with a
// less helpful error.
//
// `--no-git-checks` is required on every publish call because this repository has no git
// history in this environment; pnpm's default git-clean/git-repo checks would otherwise
// reject every publish attempt regardless of actual file state.
import { spawnSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");
const isWindows = process.platform === "win32";
const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";
const npmCmd = isWindows ? "npm.cmd" : "npm";

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: isWindows });
  if (result.status !== 0) {
    console.error(`\n[publish] Command failed (exit ${result.status}): ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

const whoami = spawnSync(npmCmd, ["whoami"], { shell: isWindows, encoding: "utf8" });
if (whoami.status !== 0) {
  console.error(
    "[publish] Not logged in to npm on this machine. Run `npm login` first (interactive — " +
      "cannot be automated), then re-run this script.",
  );
  process.exit(1);
}
console.log(`[publish] Logged in to npm as: ${whoami.stdout.trim()}`);

const PACKAGES = ["@visual-node/core", "@visual-node/proto-gen", "visual-node"];

if (dryRun) {
  console.log("[publish] --dry-run: no package will actually be published.");
}

for (const pkg of PACKAGES) {
  const args = ["--filter", pkg, "publish", "--no-git-checks"];
  if (dryRun) args.push("--dry-run");
  run(pnpmCmd, args);
}

console.log(
  `\n[publish] Done. ${dryRun ? "(dry run — nothing was actually published)" : "Published:"}`,
);
if (!dryRun) {
  for (const pkg of PACKAGES) {
    console.log(`  https://www.npmjs.com/package/${pkg}`);
  }
}
