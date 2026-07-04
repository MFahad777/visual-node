import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

export interface ComparisonNodeOptions {
  type: string;
  label: string;
  description: string;
  operator: "===" | "!==" | ">" | "<" | ">=" | "<=";
}

/**
 * Shared factory for the six comparison operator node types (Equal/NotEqual/GreaterThan/
 * LessThan/GreaterOrEqual/LessOrEqual). Same shape as `binary-math.factory.ts` — fixed "a"/"b"
 * value inputs, one "result" value output — only the operator string and label/description
 * differ, so this is kept as its own small factory rather than sharing code with the math one.
 */
export function createComparisonNode(opts: ComparisonNodeOptions): NodeDefinition {
  return {
    type: opts.type,
    category: "operators",
    label: opts.label,
    description: opts.description,
    inputs: [
      { id: "a", label: "A", kind: "value" },
      { id: "b", label: "B", kind: "value" },
    ],
    outputs: [{ id: "result", label: "Result", kind: "value" }],
    configSchema: [],
    emit: (node, ctx) => {
      const a = resolveValuePin(node, ctx, "a", { defaultLiteral: "0" });
      const b = resolveValuePin(node, ctx, "b", { defaultLiteral: "0" });
      const resultVar = `_op_${sanitizeIdentifier(node.id)}`;
      return { body: `const ${resultVar} = (${a} ${opts.operator} ${b});`, order: 0 };
    },
    resultIdentifier: (node) => `_op_${sanitizeIdentifier(node.id)}`,
  };
}
