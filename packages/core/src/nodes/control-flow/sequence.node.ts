import type { NodeDefinition } from "../../schema/node-registry.js";

/**
 * Blueprint-style "Sequence": one execution input ("In"), and N execution outputs that ALL
 * fire, unconditionally, in left-to-right pin order — unlike Branch/Switch, this is not a
 * fork that picks one arm; every wired pin's downstream chain runs. Used to make the emitted
 * code's statement ORDER explicit when the graph's wiring topology alone doesn't determine it
 * (e.g. several independent early-return chains hanging off one point, like a sequence of
 * `if (...) return X;` guard clauses with no data dependency forcing an order between them).
 *
 * One static pin ("then-0") always exists; users add more via the on-canvas "+ Add pin"
 * button rendered directly on the node face (`editor-ui/src/canvas/GenericNode.tsx`) — this
 * mirrors the variadic boolean operators' on-canvas affordance, NOT Switch's config-panel
 * list, since the user explicitly wants this control on the node itself. `node.data.pins:
 * Array<{ id: string }>` is the runtime source of truth for pins beyond the static "then-0";
 * `id`s are minted from a monotonic `nextPinSeq` counter (never reused), same convention as
 * Switch's `nextCaseSeq` / the variadic booleans' `nextInputSeq`. Pin *labels* ("Then 1",
 * "Then 2", ...) are derived from DISPLAY INDEX at render time, not stored — removing a
 * middle pin never renumbers a later pin's stored id/wire, but its displayed label shifts
 * down by one.
 *
 * Real compilation never goes through this file's `emit()`. `codegen/exec-chain.ts`'s
 * `emitBlock` special-cases `node.type === "controlFlow.sequence"` (via `getForkArmPinIds`,
 * which returns `["then-0", ...getSequencePins(node).map(p => \`then-${p.id}\`)]`), compiles
 * each wired pin's chain as its own independent scope (same per-arm fresh `emitted` copy as
 * Branch/Switch), then assembles them via `assembleSequence(arms)` — unlike
 * `assembleIfElse`/`assembleSwitchStatement`, this concatenates every WIRED arm's code
 * unconditionally in pin order, each wrapped in its own `{ }` block (to preserve independent
 * const/let scoping per pin). `emit()` below is a defensive stub only, mirroring Branch/Switch's.
 *
 * No `resultIdentifier` — this node produces no reusable value, only execution flow.
 * `schema/validate.ts` has its own Sequence-specific structural checks (`data.pins` must be
 * an array of `{id}` objects with non-empty, unique ids; every outgoing edge's `sourceHandle`
 * must name "then-0" or a still-present `then-<id>`; at least one pin's outgoing edge must
 * exist) — see the "Sequence structural checks" section there.
 *
 * Cross-pin value references are deliberately NOT allowed (same isolation Branch/Switch
 * arms already have): each pin gets its own fresh copy of the exec-chain walker's `emitted`
 * set, so a value "read" from an earlier pin would actually be silently RE-COMPUTED inside
 * the later pin's block, not reused — wrong for any producer with side effects. Share a
 * value across pins by wiring the same producer node directly into every consuming pin
 * instead (each pin then independently, correctly, re-hoists it).
 */
export const controlFlowSequenceNode: NodeDefinition = {
  type: "controlFlow.sequence",
  category: "controlFlow",
  label: "Sequence",
  description:
    "Runs each wired execution output in left-to-right order, unconditionally — every wired pin fires " +
    "(unlike Branch/Switch, which pick exactly one). Compiled by codegen/exec-chain.ts, not by this node's own emit().",
  inputs: [{ id: "in", label: "In", kind: "exec" }],
  outputs: [
    // Additional "then-<id>" outputs are dynamic — see the doc comment above. Only "then-0"
    // is static since it exists on every instance regardless of the current pin list.
    { id: "then-0", label: "Then 0", kind: "exec" },
  ],
  configSchema: [],
  emit: () => {
    throw new Error('controlFlow.sequence is compiled by the exec-chain walker (codegen/exec-chain.ts), not emitted directly');
  },
};
