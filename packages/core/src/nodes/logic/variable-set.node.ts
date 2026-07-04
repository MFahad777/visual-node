import type { NodeDefinition } from "../../schema/node-registry.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

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

    const expr = resolveValuePin(node, ctx, "value");
    // A `const` can never be reassigned, so a Set node targeting one emits its own scoped
    // `const` redeclaration (`const x = expr;`) instead of a bare assignment (`x = expr;`).
    // Wherever this statement lands (a route handler, a function body, a Branch/Switch arm
    // — each its own JS block), it shadows the outer module-level `const` for the rest of
    // that block without ever mutating it — no `validate.ts` guard needed, this is valid JS
    // as written. (Two Set nodes for the same const variable landing in the very same
    // block would be a genuine duplicate-`const` `SyntaxError`, same as hand-writing it
    // twice — not specially guarded against, consistent with this codebase's
    // trust-the-user treatment of Custom Code.)
    const statement = variable.keyword === "const" ? `const ${variable.name} = ${expr};` : `${variable.name} = ${expr};`;
    return { body: statement, order: 0 };
  },
};
