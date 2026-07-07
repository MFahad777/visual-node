import type { NodeDefinition, PortDefinition, ConfigField } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

export interface ArrayLoopNodeOptions {
  type: string;
  label: string;
  description: string;
  method: "map" | "filter" | "forEach" | "flatMap" | "find" | "findIndex" | "every" | "some" | "reduce";
  hasAccumulator: boolean; // true only for reduce
  producesResult: boolean; // false only for forEach
}

/**
 * Shared factory for the 9 iterative array method node types (map/filter/forEach/flatMap/
 * find/findIndex/every/some/reduce). These are loop-container nodes with an execution-body
 * pin that repeats for each element, similar to Branch/Switch/Sequence in structure but a
 * single repeating arm instead of multiple mutually-exclusive arms.
 *
 * Each has:
 * - Input: `in` (exec), `array` (value)
 * - Outputs: `loopBody` (exec, repeats per element), `element`/`index`/`arrayRef`/
 *   (reduce: `accumulator`) value pins, `completed` (exec, after loop)
 * - Config: reduce only has `initialValue`
 *
 * The actual loop emission is handled by codegen/exec-chain.ts, which recursively
 * compiles the loopBody as a nested scope with context variables injected.
 */
export function createArrayLoopNode(opts: ArrayLoopNodeOptions): NodeDefinition {
  const outputs: PortDefinition[] = [
    { id: "loopBody", label: "Loop Body", kind: "exec" },
    { id: "element", label: "Element", kind: "value" },
    { id: "index", label: "Index", kind: "value" },
    { id: "arrayRef", label: "Array", kind: "value" },
  ];

  const contextPinIds = ["element", "index", "arrayRef"];
  if (opts.hasAccumulator) {
    outputs.push({ id: "accumulator", label: "Accumulator", kind: "value" });
    contextPinIds.push("accumulator");
  }

  outputs.push({ id: "completed", label: "Completed", kind: "exec" });
  if (opts.producesResult) {
    outputs.push({ id: "result", label: "Result", kind: "value" });
  }

  const configSchema: ConfigField[] = [];

  if (opts.method === "reduce") {
    configSchema.push({
      key: "initialValue",
      label: "Initial Value",
      type: "text",
      default: "0",
      hint: "Starting value for the accumulator. Any JS expression.",
    });
  }

  const baseDef: NodeDefinition = {
    type: opts.type,
    category: "array",
    label: opts.label,
    description: opts.description,
    inputs: [
      { id: "in", label: "In", kind: "exec" },
      { id: "array", label: "Array", kind: "value" },
    ],
    outputs,
    configSchema,
    loopShape: { bodyPin: "loopBody", completedPin: "completed", contextPinIds },
    emit: (node, ctx) => {
      // Loop-body code is always wired visually via the loopBody pin; exec-chain.ts
      // handles all emission via assembleWiredLoopCall. This emit() should never be called
      // in practice (loopBody is always an exec-exit pin with outgoing edges), but provide
      // a minimal fallback to avoid errors if somehow called with an unwired loopBody.
      const arrayExpr = resolveValuePin(node, ctx, "array", { defaultLiteral: "[]" });
      const resultVar = `_arr_${sanitizeIdentifier(node.id)}`;
      const method = node.type.slice("array.".length);

      if (opts.producesResult) {
        return {
          body: `const ${resultVar} = ${arrayExpr}.${method}((item, index, array) => {});`,
          order: 0,
        };
      }
      return {
        body: `${arrayExpr}.${method}((item, index, array) => {});`,
        order: 0,
      };
    },
    // Handle-aware: context pins resolve to the SAME per-node-unique identifiers
    // `assembleWiredLoopCall` (exec-chain.ts) uses as the wired callback's real parameter
    // names, so a node wired inside this loop's body reading "element"/"index"/"arrayRef"
    // gets the correct scoped variable. Set unconditionally (not only when producesResult) —
    // context pins are legal to read even on forEach, which has no overall "result".
    resultIdentifier: (node, handle) => {
      const id = sanitizeIdentifier(node.id);
      switch (handle) {
        case "element":
          return `_item_${id}`;
        case "index":
          return `_index_${id}`;
        case "arrayRef":
          return `_array_${id}`;
        case "accumulator":
          return `_acc_${id}`;
        default:
          if (!opts.producesResult) {
            throw new Error(`Node "${node.id}" (${opts.method}) produces no reusable value`);
          }
          return `_arr_${id}`;
      }
    },
  };

  return baseDef;
}
