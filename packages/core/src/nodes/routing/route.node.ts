import type { NodeDefinition } from "../../schema/node-registry.js";

const VALID_METHODS = new Set(["get", "post", "put", "delete", "patch"]);
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const routeNode: NodeDefinition = {
  type: "express.route",
  category: "routing",
  label: "Route",
  description: "Defines an HTTP route and attaches a Handler Function to it.",
  inputs: [{ id: "in", label: "App" }],
  outputs: [{ id: "out", label: "Handler", kind: "exec" }],
  configSchema: [
    { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE", "PATCH"], default: "GET" },
    { key: "path", label: "Path", type: "text", default: "/" },
  ],
  emit: (node, ctx) => {
    const method = String(node.data?.method ?? "GET").toLowerCase();
    if (!VALID_METHODS.has(method)) {
      throw new Error(`Route node "${node.id}" has invalid method "${node.data?.method}"`);
    }
    const path = String(node.data?.path ?? "/");

    const outgoing = ctx.getOutgoing(node.id);
    if (outgoing.length === 0) {
      throw new Error(`Route node "${node.id}" (${method.toUpperCase()} ${path}) has no Handler Function attached`);
    }

    // Collect handler names by walking the handler chain from the first outgoing edge
    const handlerNames: string[] = [];
    let currentId: string | undefined = outgoing[0].target;
    const visitedIds = new Set<string>();

    while (currentId) {
      if (visitedIds.has(currentId)) {
        throw new Error(`Route node "${node.id}" (${method.toUpperCase()} ${path}) has a cycle in the handler chain`);
      }
      visitedIds.add(currentId);

      const targetNode = ctx.getNode(currentId);
      if (!targetNode || targetNode.type !== "logic.handlerFunction") {
        throw new Error(
          `Route node "${node.id}" (${method.toUpperCase()} ${path}) handler chain must contain only Handler Function nodes, got "${targetNode?.type ?? "unknown"}"`,
        );
      }

      const handlerName = String(targetNode.data?.name ?? "").trim();
      if (!IDENTIFIER_RE.test(handlerName)) {
        throw new Error(`Handler Function node "${targetNode.id}" has an invalid function name "${targetNode.data?.name}"`);
      }
      handlerNames.push(handlerName);

      // Continue to the next handler in the chain (if wired)
      const nextOutgoing = ctx.getOutgoing(currentId);
      currentId = nextOutgoing.length > 0 ? nextOutgoing[0].target : undefined;
    }

    if (handlerNames.length === 0) {
      throw new Error(`Route node "${node.id}" (${method.toUpperCase()} ${path}) has no Handler Function in the chain`);
    }

    const handlerArgs = handlerNames.join(", ");
    return {
      setup: `app.${method}(${JSON.stringify(path)}, ${handlerArgs});`,
      order: 20,
    };
  },
};
