import type { NodeDefinition } from "../../schema/node-registry.js";

/**
 * Reads the current value of a file-scoped (main canvas) or function-scoped (inside a
 * Function's blueprint graph) variable declared in `flow.variables`/`graph.variables` (see
 * `VariableDeclaration` in `schema/node.types.ts`). Pure, value-producing, no execution pins
 * — the same shape as `logic.graphEntry`'s value outputs. Which variable it's bound to is set
 * at node-creation time via `data.variableId` (editor-ui's drag-a-variable-onto-canvas flow),
 * not editable through the generic config panel — hence the empty `configSchema`.
 */
export const variableGetNode: NodeDefinition = {
  type: "variable.get",
  category: "logic",
  label: "Get Variable",
  description: "Reads the current value of a declared variable. Bound to a specific variable at creation time.",
  inputs: [],
  outputs: [{ id: "value", label: "Value", kind: "value" }],
  configSchema: [],
  emit: () => ({ order: 0 }),
  resultIdentifier: (node, _handle, ctx) => {
    const variableId = (node.data as Record<string, unknown> | undefined)?.variableId;
    const variable = (ctx?.flow.variables ?? []).find((v) => v.id === variableId);
    if (!variable) {
      throw new Error(`Get Variable node "${node.id}" references unknown variable "${String(variableId)}"`);
    }
    return variable.name;
  },
};
