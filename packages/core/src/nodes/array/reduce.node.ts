import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

/**
 * Reduce is a loop-container node like map/filter/forEach, but with a special accumulator
 * value pin and an initialValue config field (for seeding the accumulator). The callback
 * receives (accumulator, item, index, array).
 */
export const arrayReduceNode: NodeDefinition = {
  type: "array.reduce",
  category: "array",
  label: "Reduce",
  description: "Reduces an array to a single value by applying the callback to an accumulator and each element.",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "array", label: "Array", kind: "value" },
  ],
  outputs: [
    { id: "loopBody", label: "Loop Body", kind: "exec" },
    { id: "element", label: "Element", kind: "value" },
    { id: "index", label: "Index", kind: "value" },
    { id: "arrayRef", label: "Array", kind: "value" },
    { id: "accumulator", label: "Accumulator", kind: "value" },
    { id: "completed", label: "Completed", kind: "exec" },
    { id: "result", label: "Result", kind: "value" },
  ],
  loopShape: { bodyPin: "loopBody", completedPin: "completed", contextPinIds: ["element", "index", "arrayRef", "accumulator"] },
  configSchema: [
    {
      key: "callback",
      label: "Callback",
      type: "code",
      default: "",
      hint: "Available: accumulator, item, index, array. Use `return` to produce the next accumulator value.",
    },
    {
      key: "initialValue",
      label: "Initial Value",
      type: "text",
      default: "0",
      hint: "Starting value for the accumulator. Any JS expression.",
    },
  ],
  // Unwired-fallback path only — exec-chain.ts's loop dispatch calls this when "loopBody"
  // has no outgoing wire, splicing the raw `callback` text verbatim with fixed
  // accumulator/current/index/array param names (unchanged from before loop-body wiring
  // existed). When "loopBody" IS wired, exec-chain.ts's `assembleWiredLoopCall` is used
  // instead.
  emit: (node, ctx) => {
    const arrayExpr = resolveValuePin(node, ctx, "array", { defaultLiteral: "[]" });
    const callback = (node.data as Record<string, unknown> | undefined)?.callback ?? "";
    const initialValue = (node.data as Record<string, unknown> | undefined)?.initialValue ?? "0";
    const resultVar = `_arr_${sanitizeIdentifier(node.id)}`;

    return {
      body: `const ${resultVar} = ${arrayExpr}.reduce((accumulator, current, index, array) => {\n${callback}\n}, ${initialValue});`,
      order: 0,
    };
  },
  // Handle-aware, mirroring array-loop.factory.ts's scheme — see that file's comment for why
  // these are per-node-unique identifiers rather than bare names.
  resultIdentifier: (node, handle) => {
    const id = sanitizeIdentifier(node.id);
    switch (handle) {
      case "element":
        return `_item_${id}`;
      case "index":
        return `_index_${id}`;
      case "arrayRef":
        return `_array_${id}`;
      case "accumulator":
        return `_acc_${id}`;
      default:
        return `_arr_${id}`;
    }
  },
};
