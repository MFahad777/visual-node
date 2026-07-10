import type { NodeDefinition } from "../../schema/node-registry.js";
import { resultIdentifierFor } from "../../codegen/emit-function-graph.js";

export const sendJsonNode: NodeDefinition = {
  type: "handler.sendJson",
  category: "handler",
  label: "Send JSON",
  description: "Terminal handler: responds with a JSON body and status code.",
  inputs: [
    { id: "in", label: "Request" },
    { id: "jsonBody", label: "JSON Body", kind: "value" },
  ],
  outputs: [],
  configSchema: [
    { key: "statusCode", label: "Status Code", type: "number", default: 200 },
    { key: "body", label: "JSON Body", type: "code", default: {} },
  ],
  emit: (node, ctx) => {
    const statusCode = Number.isFinite(node.data?.statusCode) ? node.data.statusCode : 200;

    const incoming = ctx.getIncoming(node.id, "jsonBody");
    if (incoming.length > 1) {
      throw new Error(`Node "${node.id}" input "jsonBody" has more than one incoming connection`);
    }

    let bodyExpr: string;
    if (incoming[0]) {
      const source = ctx.getNode(incoming[0].source);
      if (!source) {
        throw new Error(`Node "${node.id}" input "jsonBody" references unknown node "${incoming[0].source}"`);
      }
      bodyExpr = resultIdentifierFor(source, incoming[0].sourceHandle, ctx);
    } else {
      const body = node.data?.body ?? {};
      bodyExpr = JSON.stringify(body);
    }

    return {
      body: `res.status(${statusCode}).json(${bodyExpr});`,
      order: 0,
    };
  },
};
