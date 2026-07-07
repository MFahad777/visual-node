import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayMapNode = createArrayLoopNode({
  type: "array.map",
  label: "Map",
  description: "Transforms each element in an array using the callback, producing a new array.",
  method: "map",
  hasAccumulator: false,
  producesResult: true,
});
