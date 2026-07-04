import type { PortDefinition } from "@visual-node/core";

/**
 * Whether a port represents execution flow (rendered as a white arrowhead, wired with a
 * plain white edge) or a value (colored circle). Prefers the explicit `kind` set by every
 * Phase 7+ node type; falls back to the pre-Phase-7 `"in"`/`"out"` id-naming convention for
 * node types registered before `PortDefinition.kind` existed (they never set it).
 */
export function isExecPort(port: Pick<PortDefinition, "id" | "kind">): boolean {
  if (port.kind === "exec") return true;
  if (port.kind === "value") return false;
  return port.id === "in" || port.id === "out"; // legacy fallback for pre-Phase-7 node types (no `kind` set)
}
