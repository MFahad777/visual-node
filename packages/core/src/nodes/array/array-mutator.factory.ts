import type { NodeDefinition, PortDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

export interface ArrayMutatorNodeOptions {
  type: string;
  label: string;
  description: string;
  method: "push" | "pop" | "unshift" | "shift";
  takesValue: boolean;
}

/**
 * Shared factory for the 4 mutator node types (push/pop/unshift/shift). These are simple
 * exec pass-through nodes (one exec-in, one exec-out) that mutate an array in place.
 * push/unshift add a value input pin; all four produce a result output.
 */
export function createArrayMutatorNode(opts: ArrayMutatorNodeOptions): NodeDefinition {
  const inputs: PortDefinition[] = [
    { id: "in", label: "In", kind: "exec" },
    { id: "array", label: "Array", kind: "value" },
  ];

  if (opts.takesValue) {
    inputs.push({ id: "value", label: "Value", kind: "value" });
  }

  return {
    type: opts.type,
    category: "array",
    label: opts.label,
    description: opts.description,
    inputs,
    outputs: [
      { id: "out", label: "Next", kind: "exec" },
      { id: "result", label: "Result", kind: "value" },
    ],
    configSchema: [],
    emit: (node, ctx) => {
      const arrayExpr = resolveValuePin(node, ctx, "array", { defaultLiteral: "[]" });
      const resultVar = `_arr_${sanitizeIdentifier(node.id)}`;
      const valueArg = opts.takesValue ? resolveValuePin(node, ctx, "value", { defaultLiteral: "null" }) : "";
      const callExpr = opts.takesValue
        ? `${arrayExpr}.${opts.method}(${valueArg})`
        : `${arrayExpr}.${opts.method}()`;
      return { body: `const ${resultVar} = ${callExpr};`, order: 0 };
    },
    resultIdentifier: (node) => `_arr_${sanitizeIdentifier(node.id)}`,
  };
}
