import type { DiagnosticFrame } from "../schema/diagnostics.js";

export class NestedGraphError extends Error {
  constructor(message: string, public readonly path: DiagnosticFrame[] = []) {
    super(message);
  }
}

/** If `err` is already a NestedGraphError (bubbling from a deeper nested graph), PREPEND `frame`
 *  to its existing path — preserves every intermediate Function/Promise's identity at arbitrary
 *  depth. Otherwise `frame` becomes path[0]. */
export function wrapNestedGraphError(err: unknown, frame: DiagnosticFrame): NestedGraphError {
  if (err instanceof NestedGraphError) return new NestedGraphError(err.message, [frame, ...err.path]);
  return new NestedGraphError(err instanceof Error ? err.message : String(err), [frame]);
}
