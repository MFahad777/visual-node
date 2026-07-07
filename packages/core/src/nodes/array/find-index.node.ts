import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayFindIndexNode = createArrayLoopNode({
  type: "array.findIndex",
  label: "FindIndex",
  description: "Returns the index of the first element that satisfies the callback, or -1.",
  method: "findIndex",
  hasAccumulator: false,
  producesResult: true,
});
