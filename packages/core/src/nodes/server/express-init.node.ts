import type { NodeDefinition } from "../../schema/node-registry.js";

export const expressInitNode: NodeDefinition = {
  type: "express.init",
  category: "server",
  label: "Express App",
  description: "Creates the Express application instance. Exactly one is allowed per flow.",
  inputs: [],
  outputs: [{ id: "out", label: "App" }],
  configSchema: [],
  emit: () => ({
    imports: [`const express = require("express");`],
    setup: `const app = express();`,
    order: 0,
  }),
};
