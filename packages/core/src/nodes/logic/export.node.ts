import type { NodeDefinition } from "../../schema/node-registry.js";

export const logicExportNode: NodeDefinition = {
  type: "logic.export",
  category: "logic",
  label: "Export",
  description:
    "Marks which Function node(s) in this file are exported (module.exports) so other blueprint files " +
    "can require() them. At most one Export node is allowed per file.",
  inputs: [{ id: "in", label: "Functions" }],
  outputs: [],
  configSchema: [],
  emit: (node, ctx) => {
    const names = ctx.getIncoming(node.id, "in").map((edge) => {
      const source = ctx.getNode(edge.source);
      if (!source || source.type !== "logic.function") {
        throw new Error(`Export node "${node.id}" has an incoming connection from a non-Function node`);
      }
      return String(source.data?.name ?? "").trim();
    });
    return { setup: `module.exports = { ${names.join(", ")} };`, order: 90 };
  },
};
