import type { NodeDefinition } from "../../schema/node-registry.js";
import { resultIdentifierFor } from "../../codegen/emit-function-graph.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Calls an exported function from a `logic.require`'d module. Unlike other node types,
 * instances of this one are never hand-configured from a blank default — the editor
 * creates them pre-filled from a specific resolved function (picked via search), and
 * `params`/`variableName`/`functionName` are treated as fixed for the node's lifetime.
 * A parameter's value comes from whatever's wired into its `param-<N>` input, or falls back
 * to the raw JS expression in `arg-<N>` when that pin has no incoming edge. At the top level
 * of a flow, `validate.ts` restricts a wired source to another Function Call node (chaining
 * that call's `resultVariable`); this node is also reused inside a Function's blueprint body
 * graph (see `emit-function-graph.ts`), where a wired source may instead be a Parameter or
 * an operator node — `resultIdentifierFor()` resolves either uniformly.
 */
export const logicFunctionCallNode: NodeDefinition = {
  type: "logic.functionCall",
  category: "logic",
  label: "Function Call",
  description:
    "Calls an exported function from a required module. Created from the node search (pick a specific " +
    "function), not configured from scratch — connect its Result output into another Function Call's " +
    "parameter to chain calls, or leave a parameter unconnected and type its value directly.",
  inputs: [{ id: "in", label: "Request" }],
  outputs: [
    { id: "out", label: "Next" },
    { id: "result", label: "Result" },
  ],
  configSchema: [
    { key: "requirePath", label: "Module Path", type: "text", default: "" },
    { key: "variableName", label: "Module Variable", type: "text", default: "" },
    { key: "functionName", label: "Function Name", type: "text", default: "" },
    { key: "params", label: "Parameters", type: "text", default: "" },
    {
      key: "resultVariable",
      label: "Result Variable Name",
      type: "text",
      default: "result",
      hint: "Must be a valid, unique JS identifier. Other nodes reference this call's return value by this name.",
    },
  ],
  emit: (node, ctx) => {
    const variableName = String(node.data?.variableName ?? "").trim();
    const functionName = String(node.data?.functionName ?? "").trim();
    const resultVariable = String(node.data?.resultVariable ?? "").trim();

    if (!IDENTIFIER_RE.test(variableName)) {
      throw new Error(`Function Call node "${node.id}" has an invalid module variable name "${node.data?.variableName}"`);
    }
    if (!IDENTIFIER_RE.test(functionName)) {
      throw new Error(`Function Call node "${node.id}" has an invalid function name "${node.data?.functionName}"`);
    }
    if (!IDENTIFIER_RE.test(resultVariable)) {
      throw new Error(`Function Call node "${node.id}" has an invalid result variable name "${node.data?.resultVariable}"`);
    }

    const params = String(node.data?.params ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const args = params.map((_, i) => {
      const incoming = ctx.getIncoming(node.id, `param-${i}`)[0];
      if (!incoming) return String(node.data?.[`arg-${i}`] ?? "");

      const source = ctx.getNode(incoming.source);
      if (!source) {
        throw new Error(`Function Call node "${node.id}" has parameter ${i} wired from an unknown node "${incoming.source}"`);
      }
      return resultIdentifierFor(source, incoming.sourceHandle, ctx);
    });

    return {
      body: `const ${resultVariable} = ${variableName}.${functionName}(${args.join(", ")});`,
      order: 0,
    };
  },
  resultIdentifier: (node) => String(node.data?.resultVariable ?? "").trim(),
};
