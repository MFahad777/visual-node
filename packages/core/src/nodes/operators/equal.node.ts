import { createComparisonNode } from "./binary-comparison.factory.js";

export const equalNode = createComparisonNode({
  type: "operators.equal",
  label: "Equal",
  description: "Strict equality check (JS `===`).",
  operator: "===",
});
