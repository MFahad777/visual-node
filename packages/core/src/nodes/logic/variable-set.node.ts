import type { NodeDefinition } from "../../schema/node-registry.js";
import { resolveValuePin } from "../../codegen/value-pins.js";
import { formatLiteralForType } from "../../codegen/variable-declarations.js";
import { buildFunctionCallExpression, functionCallResultInlinesInto } from "./function-call.node.js";

/**
 * Assigns a new value to a declared variable (see `variable-get.node.ts` for the shared
 * variable-declaration model), then continues to the next node in the execution chain. Exec
 * passthrough that consumes one value pin — structurally identical to `debug.consoleLog`'s
 * `emit()`. This is the first `"logic"`-category node with an exec-entry input port; see
 * `codegen/graph-walker.ts`'s `collectLogicNodes()` for why that matters (an unwired instance
 * must not be unconditionally top-level-emitted).
 *
 * No `resultIdentifier` — produces no reusable value, same as `debug.consoleLog`/Branch/Switch.
 */
export const variableSetNode: NodeDefinition = {
  type: "variable.set",
  category: "logic",
  label: "Set Variable",
  description: "Assigns a new value to a declared variable, then continues to the next node.",
  inputs: [
    { id: "in", label: "Exec", kind: "exec" },
    { id: "value", label: "Value", kind: "value" },
  ],
  outputs: [{ id: "out", label: "Next", kind: "exec" }],
  configSchema: [],
  emit: (node, ctx) => {
    const variableId = (node.data as Record<string, unknown> | undefined)?.variableId;
    const variable = (ctx.flow.variables ?? []).find((v) => v.id === variableId);
    if (!variable) {
      throw new Error(`Set Variable node "${node.id}" references unknown variable "${String(variableId)}"`);
    }

    // If the "Value" pin is wired directly from a Function Call node placed immediately before
    // this Set node (its sole Result consumer), inline the call straight into this assignment
    // instead of going through the usual declare-then-reference path — collapses
    // `const result = fn(); counter = result;` into `counter = fn();`. See
    // `functionCallResultInlinesInto` for why this is only safe in that exact shape.
    const incomingValue = ctx.getIncoming(node.id, "value")[0];
    const incomingSource = incomingValue ? ctx.getNode(incomingValue.source) : undefined;
    const inlinedCall =
      incomingSource?.type === "logic.functionCall" && functionCallResultInlinesInto(incomingSource, node.id, ctx)
        ? buildFunctionCallExpression(incomingSource, ctx)
        : undefined;

    // Only the literal (unwired) fallback needs per-dataType formatting — a wired value is
    // already a proper JS expression (an identifier, a computed result) and must be spliced
    // as-is; formatLiteral is never invoked on that branch (see resolveValuePin).
    const expr =
      inlinedCall ??
      resolveValuePin(node, ctx, "value", {
        formatLiteral: (raw) => formatLiteralForType(variable.dataType, raw),
      });
    // A `const` can never be reassigned, so a Set node targeting one emits its own scoped
    // `const` redeclaration (`const x = expr;`) instead of a bare assignment (`x = expr;`).
    // Wherever this statement lands (a route handler, a function body, a Branch/Switch arm
    // — each its own JS block), it shadows the outer module-level `const` (if the variable
    // has a default value and one was emitted — see `variable-declarations.ts`) for the rest
    // of that block without ever mutating it — no `validate.ts` guard needed, this is valid
    // JS as written. If the variable has no default value, no outer `const` was emitted at
    // all, and this Set node's statement (once actually wired into a reachable execution
    // chain) is the variable's *only* declaration+initialization point in that scope. (Two
    // Set nodes for the same const variable landing in the very same block would be a genuine
    // duplicate-`const` `SyntaxError`, same as hand-writing it twice — not specially guarded
    // against, consistent with this codebase's trust-the-user treatment of Custom Code.)
    const statement = variable.keyword === "const" ? `const ${variable.name} = ${expr};` : `${variable.name} = ${expr};`;
    return { body: statement, order: 0 };
  },
};
