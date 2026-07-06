import type { NodeDefinition } from "../../schema/node-registry.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

/**
 * Ends one path through the owning Function's blueprint body graph. Any number may exist in
 * one graph — each is an independent execution-chain participant with its own "In" (exec)
 * and "Value" pins, exactly like `handler.customCode`. Wiring a Return's "In" pin from inside
 * a Branch/Switch arm emits `return <expr>;` right there (a real early return); wiring it
 * from the trunk emits it as the trunk's own terminal statement.
 *
 * A Return node with NO incoming "In" edge — the only shape possible before this node had an
 * exec pin at all — is a deliberate backward-compat fallback, handled in
 * `emit-function-graph.ts`: its value is appended as a trailing `return` after the whole
 * compiled trunk, exactly reproducing pre-exec-pin behavior so every `.blueprint` file saved
 * before this feature existed keeps compiling to byte-identical output. If a graph has no
 * Return node at all, the generated function body simply falls off the end with no return
 * statement.
 */
export const logicGraphReturnNode: NodeDefinition = {
  type: "logic.graphReturn",
  category: "logic",
  label: "Return",
  description: 'Ends this execution path, returning whatever is wired (or typed as a literal) into "Value".',
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "value", label: "Value", kind: "value" },
  ],
  outputs: [],
  configSchema: [],
  emit: (node, ctx) => ({ body: `return ${resolveValuePin(node, ctx, "value", {})};`, order: 0 }),
};
