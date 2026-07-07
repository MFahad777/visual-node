import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayFilterNode = createArrayLoopNode({
  type: "array.filter",
  label: "Filter",
  description: "Filters an array to include only elements for which the callback returns true.",
  method: "filter",
  hasAccumulator: false,
  producesResult: true,
});
