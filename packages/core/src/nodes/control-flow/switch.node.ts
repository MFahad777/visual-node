import type { NodeDefinition } from "../../schema/node-registry.js";

/**
 * Blueprint-style "Switch": one execution input ("In"), a "Selection" value input that
 * accepts a wire or literal of ANY type (number, string, or boolean — not limited to
 * integers), a static "Default" execution output, plus one dynamic "case-<id>" execution
 * output per entry in `node.data.cases: Array<{id: string, value: string|number|boolean}>`.
 * A case's `id` is a stable identifier minted by editor-ui (never reused, independent of
 * `value`) — the pin id and wiring survive editing what value a case matches. A case's
 * `value` is fully user-provided (edited in the side config panel's "Cases" list, not
 * auto-numbered) and is what the generated `switch` statement's `case <value>:` clause
 * literally compares against. Case pins are deliberately NOT declared in this file's static
 * `outputs` array — mirroring `logic.graphEntry`'s per-parameter outputs, the static
 * `NodeDefinition` stays minimal and editor-ui synthesizes
 * the rest at render time straight from `data.cases`. `getForkArmPinIds`/`getSwitchCases`
 * (`codegen/exec-chain.ts`) are the one place that reads `data.cases` for codegen purposes —
 * this file's own static `outputs` is never consulted for that.
 *
 * Like `controlFlow.branch`, this node's real compilation never goes through this file's
 * `emit()`. `codegen/exec-chain.ts`'s `emitBlock` special-cases `node.type ===
 * "controlFlow.switch"` directly, recursively compiles each wired case (plus "default") as its
 * own independent scope, resolves "selection" itself via `resolveValuePin(node, ctx,
 * "selection", ...)` (`codegen/value-pins.ts`), and assembles a real `switch` statement (each
 * case's label rendered via `JSON.stringify(value)`, so a string/number/boolean value all
 * produce a valid JS case-label literal) with each case wrapped in its own explicit `{ }`
 * block (JS `switch` cases otherwise share one block scope). `emit()` below is a defensive
 * stub only, mirroring Branch's.
 *
 * No `resultIdentifier` — this node produces no reusable value, only execution flow.
 * `schema/validate.ts` has its own Switch-specific structural checks (`data.cases` must be an
 * array of `{id, value}` objects with unique, primitive `value`s and non-empty `id`s; every
 * outgoing edge's `sourceHandle` must name either "default" or a case id still present in
 * `data.cases` — catching a stale edge left over after a case was removed on canvas; at least
 * one case's or "default"'s outgoing edge must exist; "selection" has at most one incoming
 * edge and a literal fallback when unwired) that run ahead of codegen — see the "Switch
 * structural checks" section there.
 */
export const controlFlowSwitchNode: NodeDefinition = {
  type: "controlFlow.switch",
  category: "controlFlow",
  label: "Switch",
  description:
    'A "Switch on Int": routes execution to the output matching "Selection", or "Default" if no case ' +
    "matches. Compiled by codegen/exec-chain.ts, not by this node's own emit().",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "selection", label: "Selection", kind: "value" },
  ],
  outputs: [
    // Per-case "case-<v>" outputs are dynamic — see the doc comment above. Only "default" is
    // static since it exists on every instance regardless of the current case list.
    { id: "default", label: "Default", kind: "exec" },
  ],
  configSchema: [],
  emit: () => {
    throw new Error('controlFlow.switch is compiled by the exec-chain walker (codegen/exec-chain.ts), not emitted directly');
  },
};
