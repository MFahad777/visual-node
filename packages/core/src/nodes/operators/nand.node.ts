import { createVariadicBooleanNode } from "./boolean-variadic.factory.js";

export const nandNode = createVariadicBooleanNode({
  type: "operators.nand",
  label: "NAND",
  description: "Negated AND: false only if every input is truthy.",
  combinator: "nand",
});
