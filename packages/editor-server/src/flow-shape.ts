import type { Flow } from "@flowserver/core";

/**
 * Shallow shape check for a client-supplied "flow" request body — just enough to catch
 * garbage before it hits the filesystem or core's real `validateFlow()`. Shared between
 * `flow.routes.ts` (the single fixed flow.json) and `files.routes.ts` (per-file blueprints)
 * since both accept a `Flow`-shaped body from the client.
 */
export function isPlausibleFlow(value: unknown): value is Flow {
  if (!value || typeof value !== "object") return false;
  const flow = value as Record<string, unknown>;
  return Array.isArray(flow.nodes) && Array.isArray(flow.edges) && typeof flow.meta === "object" && flow.meta !== null;
}
