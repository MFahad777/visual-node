import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

/**
 * Pure value node — checks if a value is an array via Array.isArray().
 * Single input pin ("Value"), single output pin ("Result" boolean).
 * No execution pins, no config.
 */
export const isArrayNode: NodeDefinition = {
  type: "array.isArray",
  category: "array",
  label: "Is Array",
  description: "Checks if a value is an array using Array.isArray().",
  inputs: [{ id: "value", label: "Value", kind: "value" }],
  outputs: [{ id: "result", label: "Result", kind: "value" }],
  configSchema: [],
  emit: (node, ctx) => {
    const valueExpr = resolveValuePin(node, ctx, "value", { defaultLiteral: "undefined" });
    const resultVar = `_arr_${sanitizeIdentifier(node.id)}`;
    return { body: `const ${resultVar} = Array.isArray(${valueExpr});`, order: 0 };
  },
  resultIdentifier: (node) => `_arr_${sanitizeIdentifier(node.id)}`,
};
