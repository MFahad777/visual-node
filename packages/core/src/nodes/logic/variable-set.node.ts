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
    if (variable.keyword === "const") {
      throw new Error(`Set Variable node "${node.id}" cannot assign to "${variable.name}", which is declared as "const"`);
    }

    const expr = resolveValuePin(node, ctx, "value");
    return { body: `${variable.name} = ${expr};`, order: 0 };
  },
};
