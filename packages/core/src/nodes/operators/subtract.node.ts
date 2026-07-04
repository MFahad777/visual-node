import { createBinaryMathNode } from "./binary-math.factory.js";

export const subtractNode = createBinaryMathNode({
  type: "operators.subtract",
  label: "Subtract",
  description: "Subtracts B from A (JS `-`).",
  operator: "-",
});
