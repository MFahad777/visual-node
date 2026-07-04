import type { NodeDefinition } from "../../schema/node-registry.js";

export const sendJsonNode: NodeDefinition = {
  type: "handler.sendJson",
  category: "handler",
  label: "Send JSON",
  description: "Terminal handler: responds with a JSON body and status code.",
  inputs: [{ id: "in", label: "Request" }],
  outputs: [],
  configSchema: [
    { key: "statusCode", label: "Status Code", type: "number", default: 200 },
    { key: "body", label: "JSON Body", type: "code", default: {} },
  ],
  emit: (node) => {
    const statusCode = Number.isFinite(node.data?.statusCode) ? node.data.statusCode : 200;
    const body = node.data?.body ?? {};
    return {
      body: `res.status(${statusCode}).json(${JSON.stringify(body)});`,
      order: 0,
    };
  },
};
