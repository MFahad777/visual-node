import { createComparisonNode } from "./binary-comparison.factory.js";

export const lessThanNode = createComparisonNode({
  type: "operators.lessThan",
  label: "Less Than",
  description: "Whether A is less than B (JS `<`).",
  operator: "<",
});
