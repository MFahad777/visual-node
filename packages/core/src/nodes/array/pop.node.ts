import { createArrayMutatorNode } from "./array-mutator.factory.js";

export const arrayPopNode = createArrayMutatorNode({
  type: "array.pop",
  label: "Pop",
  description: "Removes the last element from an array and returns it.",
  method: "pop",
  takesValue: false,
});
