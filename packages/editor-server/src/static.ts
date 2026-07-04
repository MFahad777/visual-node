import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves editor-ui's built assets if they exist. No-ops otherwise, so editor-server is
 * independently runnable/testable before editor-ui has ever been built, and "just works"
 * once assets appear later with zero changes to this package.
 *
 * Two candidate locations, checked in order: `public/` bundled alongside this compiled
 * file (the published `visual-node` npm package case — see scripts/copy-ui-assets.mjs)
 * and the monorepo-sibling `packages/editor-ui/dist` (local dev/test case, e.g. running
 * `node dist/server.js` directly against a `pnpm -r build` output without publishing).
 */
export function serveStatic(app: Express): void {
  const candidates = [path.resolve(__dirname, "public"), path.resolve(__dirname, "../../editor-ui/dist")];
  const uiDist = candidates.find(existsSync);
  if (!uiDist) return;

  app.use(express.static(uiDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(uiDist, "index.html"));
  });
}
