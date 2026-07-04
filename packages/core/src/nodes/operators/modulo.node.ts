import { createBinaryMathNode } from "./binary-math.factory.js";

export const moduloNode = createBinaryMathNode({
  type: "operators.modulo",
  label: "Modulo",
  description: "Remainder of A divided by B (JS `%`).",
  operator: "%",
});
