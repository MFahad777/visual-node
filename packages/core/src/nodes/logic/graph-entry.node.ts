import type { NodeDefinition } from "../../schema/node-registry.js";
import { FunctionGraphError } from "../../codegen/emit-function-graph.js";

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
  resultIdentifier: (node, handle) => {
    if (!handle) {
      throw new FunctionGraphError(`Node "${node.id}" (logic.graphEntry) requires a source handle to resolve a value`, node.id);
    }
    return handle;
  },
};
