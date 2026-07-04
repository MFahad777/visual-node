import { createComparisonNode } from "./binary-comparison.factory.js";

export const greaterThanNode = createComparisonNode({
  type: "operators.greaterThan",
  label: "Greater Than",
  description: "Whether A is greater than B (JS `>`).",
  operator: ">",
});
