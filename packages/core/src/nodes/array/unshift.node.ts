import { createArrayMutatorNode } from "./array-mutator.factory.js";

export const arrayUnshiftNode = createArrayMutatorNode({
  type: "array.unshift",
  label: "Unshift",
  description: "Adds an element to the beginning of an array and returns the new length.",
  method: "unshift",
  takesValue: true,
});
