import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

interface CallbackArg {
  id: string;
}

function getCallbackArgs(node: { data?: Record<string, any> }): CallbackArg[] {
  return Array.isArray(node.data?.args) ? (node.data!.args as CallbackArg[]) : [];
}

/**
 * Invokes a wired function-value reference (e.g. a `logic.function` node's "Assign /
 * Parameter" output, or a "function"-typed variable's Get node) with N dynamically-added
 * `arg-<id>` value-input pins (grown/shrunk on canvas via "+ Add Arg"/"×", stable ids —
 * see `packages/editor-ui/src/store/variadicPins.ts`), and exposes the call's return value
 * via its "Result" output pin. Unlike `logic.pathExtractor`, there's no receiver object to
 * preserve `this` for, so this is a plain `(fn)(args...)` call, not `.apply(parent, args)`.
 */
export const callbackNode: NodeDefinition = {
  type: "logic.callback",
  category: "logic",
  label: "Callback",
  description:
    "Calls a wired function value (e.g. a Function node's \"Assign / Parameter\" output, or a " +
    "\"function\"-typed variable) with the dynamically added argument pins, and exposes its " +
    "return value on the Result pin.",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "function", label: "Function", kind: "value" },
  ],
  outputs: [
    { id: "out", label: "Next", kind: "exec" },
    { id: "result", label: "Result", kind: "value" },
  ],
  configSchema: [],
  emit: (node, ctx) => {
    const funcExpr = resolveValuePin(node, ctx, "function", { defaultLiteral: "undefined" });
    const argExprs = getCallbackArgs(node).map((a) =>
      resolveValuePin(node, ctx, `arg-${a.id}`, { defaultLiteral: "undefined" }),
    );

    const resultVar = `_cbresult_${sanitizeIdentifier(node.id)}`;
    return {
      body: `const ${resultVar} = ${funcExpr}(${argExprs.join(", ")});`,
      order: 0,
    };
  },
  resultIdentifier: (node) => `_cbresult_${sanitizeIdentifier(node.id)}`,
};
