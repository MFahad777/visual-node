import { createArrayLoopNode } from "./array-loop.factory.js";

export const arrayEveryNode = createArrayLoopNode({
  type: "array.every",
  label: "Every",
  description: "Returns true if every element passes the callback test.",
  method: "every",
  hasAccumulator: false,
  producesResult: true,
});
