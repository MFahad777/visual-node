import type { NodeDefinition } from "../../schema/node-registry.js";

/**
 * Blueprint-style "if": one execution input ("In"), a "Condition" value input, and TWO
 * execution outputs ("True"/"False") instead of the usual single "out" every other node in
 * this registry has. That shape is exactly why this node's `emit()` below is a defensive stub
 * that's never actually meant to run: every other `NodeDefinition.emit()` returns a flat
 * `EmittedCode` (`imports`/`setup`/`body`), which has no way to express "two independent
 * downstream sub-chains, only one of which executes." The real compilation lives entirely in
 * `codegen/exec-chain.ts`'s `emitBlock`, which special-cases `node.type === "controlFlow.branch"`
 * directly (see `getForkArmPinIds`, which returns `["true", "false"]` for this exact type
 * string), recursively compiles each wired arm as its own independent scope, resolves
 * "condition" itself via `resolveValuePin(node, ctx, "condition", ...)`
 * (`codegen/value-pins.ts`), and assembles a real `if`/`else` block. `route.node.ts` and
 * `emit-function-graph.ts` both funnel through that shared walker, so a Branch node placed
 * either directly off a Route or inside a Function's blueprint graph compiles identically.
 *
 * No `resultIdentifier` — this node produces no reusable value, only execution flow.
 * `schema/validate.ts` has its own Branch-specific structural checks (the "condition" pin
 * has at most one incoming edge and a literal fallback when unwired; at least one of
 * "true"/"false" must have an outgoing edge, since a Branch wired to nothing is almost
 * certainly a mistake) that run ahead of codegen — see the "Branch structural checks"
 * section there.
 */
export const controlFlowBranchNode: NodeDefinition = {
  type: "controlFlow.branch",
  category: "controlFlow",
  label: "Branch",
  description:
    'An "if": evaluates "Condition" and continues down either the "True" or "False" execution output, ' +
    "never both. Compiled by codegen/exec-chain.ts, not by this node's own emit().",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "condition", label: "Condition", kind: "value" },
  ],
  outputs: [
    { id: "true", label: "True", kind: "exec" },
    { id: "false", label: "False", kind: "exec" },
  ],
  configSchema: [],
  emit: () => {
    throw new Error('controlFlow.branch is compiled by the exec-chain walker (codegen/exec-chain.ts), not emitted directly');
  },
};
