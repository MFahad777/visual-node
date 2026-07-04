import { createVariadicBooleanNode } from "./boolean-variadic.factory.js";

export const orNode = createVariadicBooleanNode({
  type: "operators.or",
  label: "OR",
  description: "True if at least one input is truthy (each input is Boolean-coerced before combining).",
  combinator: "or",
});
