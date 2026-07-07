import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayFlatMapNode = createArrayLoopNode({
  type: "array.flatMap",
  label: "FlatMap",
  description: "Maps each element and flattens the result by one level.",
  method: "flatMap",
  hasAccumulator: false,
  producesResult: true,
});
