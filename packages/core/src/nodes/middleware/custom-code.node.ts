import type { NodeDefinition } from "../../schema/node-registry.js";

export const customMiddlewareNode: NodeDefinition = {
  type: "middleware.customCode",
  category: "middleware",
  label: "Custom Middleware",
  description: "Escape hatch: raw JavaScript inserted as an app.use(...) middleware.",
  inputs: [{ id: "in", label: "App" }],
  outputs: [{ id: "out", label: "App" }],
  configSchema: [
    {
      key: "code",
      label: "Code",
      type: "code",
      default: "",
      hint: "Available: req (Request), res (Response), next. Call next() to continue to the next middleware/route, or send a response (res.json/res.send/res.end) to end the chain there.",
    },
    {
      key: "isAsync",
      label: "Async Middleware",
      type: "boolean",
      default: false,
      hint: "Enable to use await inside this middleware.",
    },
    {
      key: "npmDependencies",
      label: "npm Dependencies",
      type: "text",
      default: "",
      hint: 'Comma-separated npm packages this code requires, e.g. "axios, lodash@^4.17.0".',
    },
  ],
  emit: (node) => {
    const isAsync = node.data?.isAsync === true;
    return {
      setup: `app.use(${isAsync ? "async " : ""}(req, res, next) => {\n${indent(String(node.data?.code ?? ""))}\n});`,
      order: 10,
    };
  },
};

function indent(code: string): string {
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}
