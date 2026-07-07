import { createArrayMutatorNode } from "./array-mutator.factory.js";

export const arrayPushNode = createArrayMutatorNode({
  type: "array.push",
  label: "Push",
  description: "Adds an element to the end of an array and returns the new length.",
  method: "push",
  takesValue: true,
});
