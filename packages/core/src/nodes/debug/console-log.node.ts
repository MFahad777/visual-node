import type { NodeDefinition } from "../../schema/node-registry.js";
import { resultIdentifierFor } from "../../codegen/emit-function-graph.js";

export const consoleLogNode: NodeDefinition = {
  type: "debug.consoleLog",
  category: "debugging",
  label: "Console Log",
  description: "Prints a value to the server console, then continues to the next node in the handler chain.",
  inputs: [
    { id: "in", label: "Request" },
    { id: "value", label: "Value", kind: "value" },
  ],
  outputs: [{ id: "out", label: "Next" }],
  configSchema: [
    {
      key: "expression",
      label: "Expression",
      type: "code",
      default: '"Debug:"',
      hint: "Available: req, res. Any JS expression(s), comma-separated for multiple console.log arguments, e.g. req.method, req.path. Ignored while the Value pin is wired.",
    },
  ],
  emit: (node, ctx) => {
    const incoming = ctx.getIncoming(node.id, "value");
    if (incoming.length > 1) {
      throw new Error(`Node "${node.id}" input "value" has more than one incoming connection`);
    }

    let expr: string;
    if (incoming[0]) {
      const source = ctx.getNode(incoming[0].source);
      if (!source) {
        throw new Error(`Node "${node.id}" input "value" references unknown node "${incoming[0].source}"`);
      }
      expr = resultIdentifierFor(source, incoming[0].sourceHandle, ctx);
    } else {
      // Unwired: fall back to the freely-typed "Expression" field, unwrapped (unlike
      // resolveValuePin's usual paren-wrapping) since it may hold multiple comma-separated
      // top-level expressions meant as separate console.log arguments — wrapping that in
      // parens would turn it into the JS comma *operator* and silently drop all but the last.
      expr = String(node.data?.expression ?? '""');
    }

    return { body: `console.log(${expr});`, order: 0 };
  },
};
