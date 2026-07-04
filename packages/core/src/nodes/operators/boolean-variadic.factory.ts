import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";
import type { EmitContext } from "../../schema/node-registry.js";
import type { FlowNode } from "../../schema/node.types.js";

export type BooleanCombinator = "and" | "nand" | "or" | "nor" | "xor";

export interface VariadicBooleanNodeOptions {
  type: string;
  label: string;
  description: string;
  combinator: BooleanCombinator;
}

/**
 * Combines already-`Boolean(...)`-coerced operand expressions per combinator. XOR uses a
 * left-fold pairwise `!==` (`operands.reduce((acc, cur) => \`(${acc}) !== (${cur})\`)`), which
 * is mathematically correct N-ary parity XOR (true iff an odd number of operands are true) once
 * every operand is boolean-coerced — verified by hand against all 8 three-operand truth-table
 * rows (see tests/operator-nodes.test.ts) before trusting it here.
 */
function combine(combinator: BooleanCombinator, operands: string[]): string {
  switch (combinator) {
    case "and":
      return operands.join(" && ");
    case "or":
      return operands.join(" || ");
    case "nand":
      return `!(${operands.join(" && ")})`;
    case "nor":
      return `!(${operands.join(" || ")})`;
    case "xor":
      return operands.reduce((acc, cur) => `(${acc}) !== (${cur})`);
  }
}

function resolvePinIds(node: FlowNode): string[] {
  const extraInputs: string[] = Array.isArray((node.data as Record<string, unknown> | undefined)?.extraInputs)
    ? ((node.data as Record<string, unknown>).extraInputs as string[])
    : [];
  return ["a", "b", ...extraInputs];
}

/**
 * Shared factory for the five variadic boolean combinator node types (AND/NAND/OR/NOR/XOR).
 * Pure, value-producing, no execution pins. Two static value inputs ("a"/"b") are always
 * present; additional operands come from `node.data.extraInputs: string[]` — stable, editor-ui
 * minted pin ids (e.g. "extra-0", "extra-2") that are NOT assumed to be contiguous or
 * zero-based, since removing a middle dynamic pin elsewhere must never renumber the rest.
 * Every operand is `Boolean(...)`-coerced before combining, so AND/OR/NAND/NOR/XOR produce a
 * real boolean rather than JS's raw truthy-value passthrough.
 */
export function createVariadicBooleanNode(opts: VariadicBooleanNodeOptions): NodeDefinition {
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
    emit: (node, ctx: EmitContext) => {
      const pinIds = resolvePinIds(node);
      const operands = pinIds.map((pinId) => `Boolean(${resolveValuePin(node, ctx, pinId, { defaultLiteral: "false" })})`);
      const resultVar = `_op_${sanitizeIdentifier(node.id)}`;
      return { body: `const ${resultVar} = (${combine(opts.combinator, operands)});`, order: 0 };
    },
    resultIdentifier: (node) => `_op_${sanitizeIdentifier(node.id)}`,
  };
}
