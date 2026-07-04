import type { NodeDefinition } from "../../schema/node-registry.js";

export const expressListenNode: NodeDefinition = {
  type: "express.listen",
  category: "server",
  label: "Listen",
  description: "Starts the HTTP server on a port.",
  inputs: [{ id: "in", label: "App" }],
  outputs: [],
  configSchema: [{ key: "port", label: "Port", type: "number", default: 3000 }],
  emit: (node) => {
    const port = Number.isFinite(node.data?.port) ? node.data.port : 3000;
    return {
      setup: `app.listen(${port}, () => {\n  console.log("Server running on port ${port}");\n});`,
      order: 100,
    };
  },
};
