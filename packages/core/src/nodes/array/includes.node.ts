import { createArraySearchNode } from "./array-search.factory.js";

export const arrayIncludesNode = createArraySearchNode({
  type: "array.includes",
  label: "Includes",
  description: "Returns true if the array includes the search element, false otherwise.",
  method: "includes",
});
