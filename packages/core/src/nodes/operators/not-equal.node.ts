import { createComparisonNode } from "./binary-comparison.factory.js";

export const notEqualNode = createComparisonNode({
  type: "operators.notEqual",
  label: "Not Equal",
  description: "Inequality check (JS `!==` by default, `!=` when \"Strict\" is off).",
  operator: "!==",
  looseOperator: "!=",
});
