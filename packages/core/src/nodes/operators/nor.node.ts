import { createVariadicBooleanNode } from "./boolean-variadic.factory.js";

export const norNode = createVariadicBooleanNode({
  type: "operators.nor",
  label: "NOR",
  description: "Negated OR: true only if every input is falsy.",
  combinator: "nor",
});
