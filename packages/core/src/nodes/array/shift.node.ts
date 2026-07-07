import { createArrayMutatorNode } from "./array-mutator.factory.js";

export const arrayShiftNode = createArrayMutatorNode({
  type: "array.shift",
  label: "Shift",
  description: "Removes the first element from an array and returns it.",
  method: "shift",
  takesValue: false,
});
