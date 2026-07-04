import { createComparisonNode } from "./binary-comparison.factory.js";

export const lessOrEqualNode = createComparisonNode({
  type: "operators.lessOrEqual",
  label: "Less Or Equal",
  description: "Whether A is less than or equal to B (JS `<=`).",
  operator: "<=",
});
