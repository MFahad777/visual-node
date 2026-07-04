import { createVariadicBooleanNode } from "./boolean-variadic.factory.js";

export const xorNode = createVariadicBooleanNode({
  type: "operators.xor",
  label: "XOR",
  description: "True if an odd number of inputs are truthy (N-ary parity XOR, each input Boolean-coerced first).",
  combinator: "xor",
});
