import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

/**
 * Logical negation of a single value. Hand-written rather than factory-produced — it's the
 * only unary operator, so a dedicated factory for a single node type isn't worth the
 * indirection. Pure, value-producing, no execution pins.
 */
export const notNode: NodeDefinition = {
  type: "operators.not",
  category: "operators",
  label: "NOT",
  description: "Logical negation of a value (Boolean-coerced before negating, so the result is a real boolean).",
  inputs: [{ id: "a", label: "A", kind: "value" }],
  outputs: [{ id: "result", label: "Result", kind: "value" }],
  configSchema: [],
  emit: (node, ctx) => {
    const a = resolveValuePin(node, ctx, "a", { defaultLiteral: "false" });
    const resultVar = `_op_${sanitizeIdentifier(node.id)}`;
    return { body: `const ${resultVar} = !(Boolean(${a}));`, order: 0 };
  },
  resultIdentifier: (node) => `_op_${sanitizeIdentifier(node.id)}`,
};
