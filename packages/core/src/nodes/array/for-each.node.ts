import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayForEachNode = createArrayLoopNode({
  type: "array.forEach",
  label: "ForEach",
  description: "Executes the callback for each element in an array, with no return value.",
  method: "forEach",
  hasAccumulator: false,
  producesResult: false,
});
