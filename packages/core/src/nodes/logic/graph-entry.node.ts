import type { NodeDefinition } from "../../schema/node-registry.js";
import { NestedGraphError } from "../../codegen/nested-graph-error.js";
import { frameForNode } from "../../schema/node-display-name.js";

/**
 * Represents the owning Function node's entry point inside its blueprint body graph —
 * the sub-graph counterpart to a Route node on the main canvas. Exactly one per graph,
 * auto-created and kept in sync by the function-graph editor's "Inputs" panel — never
 * added manually. Its static `out` output is an execution pin (mirroring
 * `express.route`'s "Handler" output and `logic.functionCall`'s "Next"): wiring it into
 * a `logic.functionCall`'s `in` pin establishes the call order the same way chaining
 * handler nodes does on the main canvas, instead of leaving it to implicit topological
 * tie-breaking. The remaining outputs are dynamic per-instance: editor-ui appends one
 * value pin per current parameter name from `data.params` (a string array) after this
 * static pin, the same convention used for `logic.functionCall`'s `param-<N>` pins.
 * `emit-function-graph.ts` never emits a statement
 * for this node — it's a pure data source, and `resultIdentifierFor()` resolves a wire
 * from one of its parameter pins directly to that pin's handle id (the parameter's own
 * JS identifier), not to any node-level field.
 */
export const logicGraphEntryNode: NodeDefinition = {
  type: "logic.graphEntry",
  category: "logic",
  label: "Start",
  description:
    "The entry point of a function's blueprint graph: one execution output to kick off the first " +
    "node in the chain, plus one value output pin per parameter. Exactly one per graph, managed via " +
    "the function graph editor's Inputs panel — not added manually.",
  inputs: [],
  outputs: [{ id: "out", label: "Next" }],
  configSchema: [],
  emit: () => ({ order: 0 }),
  resultIdentifier: (node, handle, ctx) => {
    if (!handle) {
      throw new NestedGraphError(`Node "${node.id}" (logic.graphEntry) requires a source handle to resolve a value`, [frameForNode(node)]);
    }
    // Inside a `logic.promise` blueprint executor graph, "resolve"/"reject" resolve to the
    // promise-instance-unique identifiers the enclosing `new Promise((resolve_X, reject_X) =>
    // ...)` actually declares (see `exec-chain.ts`'s `promiseExecutorParamNames`), not the bare
    // handle string — otherwise a `logic.promise` node nested inside this same graph would
    // lexically shadow the outer executor's "resolve"/"reject" and silently settle the wrong
    // Promise.
    if (ctx?.promiseExecutorParams && (handle === "resolve" || handle === "reject")) {
      return ctx.promiseExecutorParams[handle];
    }
    // "outerResolve"/"outerReject" (and numbered-suffix variants "outerResolve_2"/
    // "outerReject_2", ...) let a nested `logic.promise`'s own blueprint graph reach an
    // ENCLOSING Promise's resolve/reject — see `exec-chain.ts`'s `mergeEnclosingPromiseParams`
    // and `EmitContext.enclosingPromiseExecutorParams`. Depth 1 (no suffix) is the nearest
    // enclosing Promise, `enclosingPromiseExecutorParams[0]`; "_N" is index N-1.
    const outerMatch = /^outer(Resolve|Reject)(?:_(\d+))?$/.exec(handle);
    if (outerMatch && ctx?.enclosingPromiseExecutorParams) {
      const key = outerMatch[1] === "Resolve" ? "resolve" : "reject";
      const depthIndex = outerMatch[2] ? Number(outerMatch[2]) - 1 : 0;
      const params = ctx.enclosingPromiseExecutorParams[depthIndex];
      if (params) return params[key];
    }
    return handle;
  },
};
