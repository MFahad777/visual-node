import type { NodeDefinition } from "../../schema/node-registry.js";
import { emitExecChain } from "../../codegen/exec-chain.js";

const VALID_METHODS = new Set(["get", "post", "put", "delete", "patch"]);

export const routeNode: NodeDefinition = {
  type: "express.route",
  category: "routing",
  label: "Route",
  description: "Defines an HTTP route and wires it to a handler chain.",
  inputs: [{ id: "in", label: "App" }],
  outputs: [{ id: "out", label: "Handler" }],
  configSchema: [
    { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE", "PATCH"], default: "GET" },
    { key: "path", label: "Path", type: "text", default: "/" },
    {
      key: "isAsync",
      label: "Async Handler",
      type: "boolean",
      default: false,
      hint: "Enable to use await inside this handler (e.g. for async plugin nodes).",
    },
  ],
  emit: (node, ctx) => {
    const method = String(node.data?.method ?? "GET").toLowerCase();
    if (!VALID_METHODS.has(method)) {
      throw new Error(`Route node "${node.id}" has invalid method "${node.data?.method}"`);
    }
    const path = String(node.data?.path ?? "/");
    const isAsync = node.data?.isAsync === true;

    const outgoing = ctx.getOutgoing(node.id);
    if (outgoing.length === 0) {
      throw new Error(`Route node "${node.id}" (${method.toUpperCase()} ${path}) has no handler attached`);
    }

    const result = emitExecChain(outgoing[0].target, ctx);
    if (result.requiresAsync && !isAsync) {
      throw new Error(
        `Route node "${node.id}" (${method.toUpperCase()} ${path}) uses a node that requires "await" — enable the "Async Handler" checkbox on this Route node.`,
      );
    }
    const body = result.code;

    return {
      imports: result.imports.length > 0 ? result.imports : undefined,
      setup: `app.${method}(${JSON.stringify(path)}, ${isAsync ? "async " : ""}(req, res) => {\n${indent(body)}\n});`,
      order: 20,
    };
  },
};

function indent(code: string): string {
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}
