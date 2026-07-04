import type { EmitContext, NodeDefinition } from "../../schema/node-registry.js";
import type { FlowNode } from "../../schema/node.types.js";
import { resultIdentifierFor } from "../../codegen/emit-function-graph.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Whether `callNode`'s Result output can be inlined directly into `consumerId`'s own statement
 * instead of being pre-declared under `resultVariable` — true only when Result has exactly one
 * outgoing edge targeting `consumerId`, `consumerId` is also this call's immediate exec
 * successor (its "out" pin's edge target), AND `consumerId` is specifically a `variable.set`
 * node — the only consumer type actually taught to embed this call's expression (see
 * `variable-set.node.ts`). The exec-adjacency condition matters because Function Call has real
 * exec pins — its wired position IS the point a caller intended the side effect to fire;
 * inlining is only safe when the value's sole consumer sits at that exact same point, otherwise
 * the call would silently fire later than wired (e.g. after some other node in between runs).
 * The consumer-type check matters just as much: without it, this returning `true` for e.g.
 * another Function Call's param (which resolves args via a plain `resultIdentifierFor` call,
 * unaware of inlining) would make this node skip its own statement while nothing actually
 * embeds the call — silently dropping the call and leaving a dangling reference to an
 * undeclared identifier. Exported so `variable.set`'s `emit()` and this node's own `emit()`
 * consult the exact same check and can never disagree about whether a statement was inlined.
 */
export function functionCallResultInlinesInto(callNode: FlowNode, consumerId: string, ctx: EmitContext): boolean {
  const resultEdges = ctx.getOutgoing(callNode.id, "result");
  if (resultEdges.length !== 1 || resultEdges[0].target !== consumerId) return false;
  const execSuccessor = ctx.getOutgoing(callNode.id, "out")[0];
  if (execSuccessor?.target !== consumerId) return false;
  return ctx.getNode(consumerId)?.type === "variable.set";
}

/** Builds the raw `module.function(args)` call expression text — shared by `emit()`'s own
 * statement construction and by a consumer that inlines this call (see
 * `functionCallResultInlinesInto`). Throws the same validation errors either way. */
export function buildFunctionCallExpression(node: FlowNode, ctx: EmitContext): string {
  const variableName = String(node.data?.variableName ?? "").trim();
  const functionName = String(node.data?.functionName ?? "").trim();

  if (!IDENTIFIER_RE.test(variableName)) {
    throw new Error(`Function Call node "${node.id}" has an invalid module variable name "${node.data?.variableName}"`);
  }
  if (!IDENTIFIER_RE.test(functionName)) {
    throw new Error(`Function Call node "${node.id}" has an invalid function name "${node.data?.functionName}"`);
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

  return `${variableName}.${functionName}(${args.join(", ")})`;
}

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
 *
 * The "Result" output is optional: `emit()` only declares/assigns `resultVariable` when that
 * pin actually has an outgoing wire (another Function Call's param, a `variable.set` node's
 * value pin, ...). Left unwired, this compiles to a bare `fn(...);` call statement — a
 * fire-and-forget side effect, not an unused top-level `const`. Wiring "Result" directly into a
 * Set node placed immediately next (see `functionCallResultInlinesInto`) skips the intermediate
 * `resultVariable` declaration entirely — the call is inlined straight into the Set node's own
 * assignment (`counter = printerFunctions.printer(2, 3);`) instead of the two-line
 * `const result = printerFunctions.printer(2, 3); counter = result;`. Any other wiring shape
 * (chaining into another Function Call's param, multiple consumers, a Set node that isn't the
 * immediate next node) still declares `resultVariable` and references it by name.
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
    const callExpr = buildFunctionCallExpression(node, ctx);
    const resultEdges = ctx.getOutgoing(node.id, "result");

    // Fully inlined into the sole, immediately-next consumer's own statement (see
    // `functionCallResultInlinesInto`) — that consumer embeds `callExpr` itself, so this node
    // emits no statement of its own at all, not even a bare call (emitting one here too would
    // run the function twice).
    if (resultEdges.length === 1 && functionCallResultInlinesInto(node, resultEdges[0].target, ctx)) {
      return { order: 0 };
    }

    const resultVariable = String(node.data?.resultVariable ?? "").trim();
    if (!IDENTIFIER_RE.test(resultVariable)) {
      throw new Error(`Function Call node "${node.id}" has an invalid result variable name "${node.data?.resultVariable}"`);
    }

    // Only declare/assign the result when something actually consumes it (another Function
    // Call's param, a Set node's value pin, ...) — matching the "Result" pin's own semantics as
    // an optional value output, not a mandatory side effect. An unwired call is a pure
    // fire-and-forget statement; wiring the Result output to a `variable.set` node is how a
    // caller opts into keeping the return value under a name, exactly like every other
    // value-producing node in this codebase.
    const resultIsWired = resultEdges.length > 0;
    return {
      body: resultIsWired ? `const ${resultVariable} = ${callExpr};` : `${callExpr};`,
      order: 0,
    };
  },
  resultIdentifier: (node) => String(node.data?.resultVariable ?? "").trim(),
};
