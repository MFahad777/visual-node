import type { NodeDefinition } from "../../schema/node-registry.js";

export const jsonBodyParserNode: NodeDefinition = {
  type: "express.middleware.jsonParser",
  category: "middleware",
  label: "JSON Body Parser",
  description: "Parses incoming requests with JSON payloads (app.use(express.json())).",
  inputs: [{ id: "in", label: "App" }],
  outputs: [{ id: "out", label: "App" }],
  configSchema: [],
  emit: () => ({
    setup: `app.use(express.json());`,
    order: 10,
  }),
};
