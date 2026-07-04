import type { NodeDefinition } from "../../schema/node-registry.js";

export const customCodeNode: NodeDefinition = {
  type: "handler.customCode",
  category: "handler",
  label: "Custom Code",
  description: "Escape hatch: raw JavaScript inserted verbatim into the handler body.",
  inputs: [{ id: "in", label: "Request" }],
  outputs: [],
  configSchema: [
    {
      key: "code",
      label: "Code",
      type: "code",
      default: "",
      hint: "Available: req (Express Request), res (Express Response). Call res.json(...) or res.send(...) to respond — a plain `return` does nothing.",
    },
    {
      key: "npmDependencies",
      label: "npm Dependencies",
      type: "text",
      default: "",
      hint: 'Comma-separated npm packages this code requires, e.g. "axios, lodash@^4.17.0". Declares them for package.json — does not install them.',
    },
  ],
  emit: (node) => ({
    body: String(node.data?.code ?? ""),
    order: 0,
  }),
};
