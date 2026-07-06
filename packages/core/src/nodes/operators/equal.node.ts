import { createComparisonNode } from "./binary-comparison.factory.js";

export const equalNode = createComparisonNode({
  type: "operators.equal",
  label: "Equal",
  description: "Equality check (JS `===` by default, `==` when \"Strict\" is off).",
  operator: "===",
  looseOperator: "==",
});
