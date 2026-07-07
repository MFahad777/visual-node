import type { NodeDefinition } from "../../schema/node-registry.js";

export const logicExportNode: NodeDefinition = {
  type: "logic.export",
  category: "logic",
  label: "Export",
  description:
    "Marks which Function node(s) and/or variable(s) (via a Get Variable node) in this file are exported " +
    "(module.exports) so other blueprint files can require() them. At most one Export node is allowed per file.",
  inputs: [
    { id: "in", label: "Functions" },
    { id: "variables", label: "Variables", kind: "value" },
  ],
  outputs: [],
  configSchema: [],
  emit: (node, ctx) => {
    const functionNames = ctx.getIncoming(node.id, "in").map((edge) => {
      const source = ctx.getNode(edge.source);
      if (!source || source.type !== "logic.function") {
        throw new Error(`Export node "${node.id}" has an incoming connection from a non-Function node`);
      }
      return String(source.data?.name ?? "").trim();
    });
    const variableNames = ctx.getIncoming(node.id, "variables").map((edge) => {
      const source = ctx.getNode(edge.source);
      if (!source || source.type !== "variable.get") {
        throw new Error(`Export node "${node.id}" has an incoming "Variables" connection from a non-Get-Variable node`);
      }
      const variableId = (source.data as Record<string, unknown> | undefined)?.variableId;
      const variable = (ctx.flow.variables ?? []).find((v) => v.id === variableId);
      if (!variable) {
        throw new Error(`Export node "${node.id}" references an unknown variable via "${source.id}"`);
      }
      return variable.name;
    });
    const names = [...functionNames, ...variableNames];
    return { setup: `module.exports = { ${names.join(", ")} };`, order: 90 };
  },
};
