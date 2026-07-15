import type { NodeDefinition } from "../../schema/node-registry.js";
import { emitExecChain } from "../../codegen/exec-chain.js";

/**
 * Per-file entry point: runs once when this file/module is first loaded (required or executed
 * directly), before any HTTP request comes in. Zero input ports (always a root of its own exec
 * chain), one execution output ("out"). Wire it to other exec-chain-capable nodes — most
 * commonly `variable.set` — to perform file-scope setup at module-load time, e.g. giving a
 * variable its initial value before the first request arrives.
 *
 * Category is deliberately "logic", not "server": `validate.ts`'s STRUCTURAL_CATEGORIES
 * ("server"/"routing"/"middleware") force exactly one `express.init` per flow whenever any
 * structural-category node is present. A pure-logic helper file (functions/exports only, no
 * Express app) must stay usable with a Begin node without being forced to also add an unrelated
 * `express.init` — "logic" avoids that entirely.
 *
 * Because `inputs` is empty, `execEntryPort()` (exec-chain.ts) returns `undefined` for this
 * node, so `graph-walker.ts`'s `collectLogicNodes()` picks it up automatically as an
 * unconditionally-emitted top-level "logic" declaration — no core engine change needed beyond
 * registering this node type (see docs/phase11-begin-node-plan.md).
 *
 * Unlike `express.route`, an unwired Begin node is a harmless no-op rather than an error — it's
 * always optional. Unlike Route, there's no "Async Handler" checkbox: at module scope there's
 * no user-facing "handler shape" choice, so a chain that requires `await` is auto-wrapped in a
 * fire-and-forget async IIFE instead (see the design doc's "Known limitations") — unless every
 * awaited `logic.promise` node contributing that requirement has its own "Wrap In IIFE" checkbox
 * turned off (`EmitBlockResult.suppressIifeWrap`), in which case the awaited expression is
 * emitted bare. That only produces valid JS if the chain is otherwise already inside an
 * async-capable scope; it's an explicit per-instance opt-out, not a safe default.
 */
export const beginNode: NodeDefinition = {
  type: "logic.begin",
  category: "logic",
  label: "Begin",
  description: "Runs once when this file is loaded, before any request comes in. Wire it to other nodes for file-scope setup, like initializing a variable.",
  inputs: [],
  outputs: [{ id: "out", label: "Then", kind: "exec" }],
  configSchema: [],
  emit: (node, ctx) => {
    const outgoing = ctx.getOutgoing(node.id);
    if (outgoing.length === 0) {
      return { order: 10 };
    }

    const result = emitExecChain(outgoing[0].target, ctx);
    const setup =
      result.requiresAsync && !result.suppressIifeWrap
        ? `(async () => {\n${indent(result.code)}\n})();`
        : result.code;

    return {
      imports: result.imports.length > 0 ? result.imports : undefined,
      setup,
      order: 10,
    };
  },
};

function indent(code: string): string {
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}
