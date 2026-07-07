import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

export interface ArraySearchNodeOptions {
  type: string;
  label: string;
  description: string;
  method: "includes" | "indexOf";
}

/**
 * Shared factory for the 2 search node types (includes/indexOf). Simple exec pass-through
 * nodes with a searchElement value pin and optional fromIndex config field.
 */
export function createArraySearchNode(opts: ArraySearchNodeOptions): NodeDefinition {
  return {
    type: opts.type,
    category: "array",
    label: opts.label,
    description: opts.description,
    inputs: [
      { id: "in", label: "In", kind: "exec" },
      { id: "array", label: "Array", kind: "value" },
      { id: "searchElement", label: "Search Element", kind: "value" },
    ],
    outputs: [
      { id: "out", label: "Next", kind: "exec" },
      { id: "result", label: "Result", kind: "value" },
    ],
    configSchema: [
      {
        key: "fromIndex",
        label: "From Index",
        type: "number",
        default: undefined,
        hint: "Optional: start searching from this index. Leave blank to search from the beginning.",
      },
    ],
    emit: (node, ctx) => {
      const arrayExpr = resolveValuePin(node, ctx, "array", { defaultLiteral: "[]" });
      const searchExpr = resolveValuePin(node, ctx, "searchElement", { defaultLiteral: "null" });
      const resultVar = `_arr_${sanitizeIdentifier(node.id)}`;
      const fromIndex = (node.data as Record<string, unknown> | undefined)?.fromIndex;
      const callExpr =
        fromIndex !== undefined && fromIndex !== null
          ? `${arrayExpr}.${opts.method}(${searchExpr}, ${fromIndex})`
          : `${arrayExpr}.${opts.method}(${searchExpr})`;
      return { body: `const ${resultVar} = ${callExpr};`, order: 0 };
    },
    resultIdentifier: (node) => `_arr_${sanitizeIdentifier(node.id)}`,
  };
}
