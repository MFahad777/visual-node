import { createComparisonNode } from "./binary-comparison.factory.js";

export const greaterOrEqualNode = createComparisonNode({
  type: "operators.greaterOrEqual",
  label: "Greater Or Equal",
  description: "Whether A is greater than or equal to B (JS `>=`).",
  operator: ">=",
});
