import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves editor-ui's built dist/ if it exists. No-ops otherwise, so editor-server is
 * independently runnable/testable before editor-ui has ever been built, and "just works"
 * once dist/ appears later with zero changes to this package.
 */
export function serveStatic(app: Express): void {
  const uiDist = path.resolve(__dirname, "../../editor-ui/dist");
  if (!existsSync(uiDist)) return;

  app.use(express.static(uiDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(uiDist, "index.html"));
  });
}
