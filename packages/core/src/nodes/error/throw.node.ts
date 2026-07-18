import type { NodeDefinition } from "../../schema/node-registry.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

/**
 * Emits `throw <expr>;` where `<expr>` is whatever's wired (or literal-typed) into "Value" —
 * typically a Get-Variable node bound to an Error-typed variable, or a Try-Catch's own
 * "Error" output pin (to re-throw inside a Catch Body). No `resultIdentifier` — this node
 * produces no reusable value, matching Branch/Switch/Return.
 */
export const throwNode: NodeDefinition = {
  type: "error.throw",
  category: "error",
  label: "Throw",
  description: 'Throws whatever is wired (or typed as a literal) into "Value", then continues to "Next".',
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "value", label: "Value", kind: "value" },
  ],
  outputs: [{ id: "out", label: "Next", kind: "exec" }],
  configSchema: [],
  emit: (node, ctx) => ({ body: `throw ${resolveValuePin(node, ctx, "value", {})};`, order: 0 }),
};
