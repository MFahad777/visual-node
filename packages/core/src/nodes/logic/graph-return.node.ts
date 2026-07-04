import type { NodeDefinition } from "../../schema/node-registry.js";

/**
 * Ends the owning Function's blueprint body graph. At most one per graph (enforced in
 * validate.ts). If present, whatever's wired into "Value" becomes `return <expr>;`; if
 * absent, the generated function body simply falls off the end with no return statement.
 */
export const logicGraphReturnNode: NodeDefinition = {
  type: "logic.graphReturn",
  category: "logic",
  label: "Return",
  description: "Ends this function's blueprint graph, returning whatever is wired into \"Value\".",
  inputs: [{ id: "value", label: "Value" }],
  outputs: [],
  configSchema: [],
  emit: () => ({ order: 0 }),
};
