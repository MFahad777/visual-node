import { createVariadicBooleanNode } from "./boolean-variadic.factory.js";

export const andNode = createVariadicBooleanNode({
  type: "operators.and",
  label: "AND",
  description: "True only if every input is truthy (each input is Boolean-coerced before combining).",
  combinator: "and",
});
