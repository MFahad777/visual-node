import { createBinaryMathNode } from "./binary-math.factory.js";

export const divideNode = createBinaryMathNode({
  type: "operators.divide",
  label: "Divide",
  description: "Divides A by B (JS `/`).",
  operator: "/",
});
