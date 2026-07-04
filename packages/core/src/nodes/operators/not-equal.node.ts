import { createComparisonNode } from "./binary-comparison.factory.js";

export const notEqualNode = createComparisonNode({
  type: "operators.notEqual",
  label: "Not Equal",
  description: "Strict inequality check (JS `!==`).",
  operator: "!==",
});
