import { createArraySearchNode } from "./array-search.factory.js";

export const arrayIndexOfNode = createArraySearchNode({
  type: "array.indexOf",
  label: "IndexOf",
  description: "Returns the index of the search element, or -1 if not found.",
  method: "indexOf",
});
