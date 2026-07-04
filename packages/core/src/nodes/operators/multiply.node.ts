import { createBinaryMathNode } from "./binary-math.factory.js";

export const multiplyNode = createBinaryMathNode({
  type: "operators.multiply",
  label: "Multiply",
  description: "Multiplies two values (JS `*`).",
  operator: "*",
});
