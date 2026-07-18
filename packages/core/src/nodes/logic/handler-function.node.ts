import type { NodeDefinition, EmitContext } from "../../schema/node-registry.js";
import type { FlowNode } from "../../schema/node.types.js";
import { emitFunctionGraphBody, type FunctionGraph } from "../../codegen/emit-function-graph.js";
import { wrapNestedGraphError } from "../../codegen/nested-graph-error.js";
import { frameForNode } from "../../schema/node-display-name.js";

export const HANDLER_FUNCTION_PARAMS = ["req", "res", "next"] as const;

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const handlerFunctionNode: NodeDefinition = {
  type: "logic.handlerFunction",
  category: "logic",
  label: "Handler Function",
  description:
    "Declares a named Express request handler function with fixed req, res, next parameters. " +
    "Attach it to a Route node via an edge to wire the handler. Chain another Handler Function " +
    "off its \"Next\" output to register multiple handlers on the same route (call next() in " +
    "this handler's body to reach it) — a single Handler Function can also be reused across " +
    "multiple routes.",
  inputs: [{ id: "in", label: "Attach", kind: "exec" }],
  outputs: [{ id: "out", label: "Next", kind: "exec" }],
  configSchema: [
    {
      key: "name",
      label: "Function Name",
      type: "text",
      default: "handler",
      hint: "Must be a valid JS identifier. This is the function name Express will call.",
    },
    {
      key: "body",
      label: "Function Body",
      type: "code",
      default: "",
      hint: "Available: req, res, next. Use res.json(...) or res.send(...) to respond, next() to continue to the next middleware.",
    },
    {
      key: "mode",
      label: "Authoring Mode",
      type: "select",
      options: ["code", "blueprint"],
      default: "code",
      hint: '"code" uses the Function Body field above; "blueprint" compiles this handler from a node graph instead (see the "Open Blueprint Graph" button).',
    },
    {
      key: "isAsync",
      label: "Async Handler",
      type: "boolean",
      default: false,
      hint: "Enable to use await inside this handler\'s body (e.g. for async plugin nodes or external API calls).",
    },
    {
      key: "npmDependencies",
      label: "npm Dependencies",
      type: "text",
      default: "",
      hint: 'Comma-separated npm packages this code requires (code mode only), e.g. "axios, lodash@^4.17.0".',
    },
  ],
  alwaysCollect: true,
  emit: (node, ctx) => {
    const name = String(node.data?.name ?? "").trim();
    if (!IDENTIFIER_RE.test(name)) {
      throw new Error(`Handler Function node "${node.id}" has an invalid function name "${node.data?.name}"`);
    }

    const mode = node.data?.mode === "blueprint" ? "blueprint" : "code";
    let body: string;
    let imports: string[] | undefined;
    if (mode === "blueprint") {
      const graph: FunctionGraph = node.data?.graph ?? { nodes: [], edges: [] };
      try {
        const result = emitFunctionGraphBody(graph, ctx.flow.variables ?? []);
        body = result.code;
        imports = result.imports;
      } catch (err) {
        throw wrapNestedGraphError(err, frameForNode(node, [ctx.flow.variables ?? []]));
      }
    } else {
      body = String(node.data?.body ?? "");
    }

    const isAsync = node.data?.isAsync === true;

    return {
      imports: imports && imports.length > 0 ? imports : undefined,
      setup: `${isAsync ? "async " : ""}function ${name}(req, res, next) {\n${indent(body)}\n}`,
      order: 5,
    };
  },
};

function indent(code: string): string {
  return code.split("\n").map((line) => (line.length > 0 ? `  ${line}` : line)).join("\n");
}
