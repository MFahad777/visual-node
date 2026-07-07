import { createArrayLoopNode } from "./array-loop.factory.js";

export const arraySomeNode = createArrayLoopNode({
  type: "array.some",
  label: "Some",
  description: "Returns true if at least one element passes the callback test.",
  method: "some",
  hasAccumulator: false,
  producesResult: true,
});
