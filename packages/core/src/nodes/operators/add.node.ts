import { createBinaryMathNode } from "./binary-math.factory.js";

export const addNode = createBinaryMathNode({
  type: "operators.add",
  label: "Add",
  description: "Adds two values (JS `+` — numeric addition or string concatenation).",
  operator: "+",
});
