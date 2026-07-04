import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

export interface BinaryMathNodeOptions {
  type: string;
  label: string;
  description: string;
  operator: "+" | "-" | "*" | "/" | "%";
}

/**
 * Shared factory for the five arithmetic operator node types (Add/Subtract/Multiply/Divide/
 * Modulo). Pure, value-producing, no execution pins: fixed "a"/"b" value inputs, one "result"
 * value output. An unwired input pin falls back to its `data.literals` entry, or `0` if
 * neither a wire nor a literal is present — see `resolveValuePin`'s `defaultLiteral`.
 */
export function createBinaryMathNode(opts: BinaryMathNodeOptions): NodeDefinition {
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
    // Empty on purpose: literal defaults are edited inline on the pin itself (canvas-managed
    // via node.data.literals), not through the generic config-field form.
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
