import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayFindNode = createArrayLoopNode({
  type: "array.find",
  label: "Find",
  description: "Returns the first element that satisfies the callback, or undefined.",
  method: "find",
  hasAccumulator: false,
  producesResult: true,
});
