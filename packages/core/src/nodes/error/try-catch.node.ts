import type { NodeDefinition } from "../../schema/node-registry.js";
import { tryCatchErrorIdentifier } from "../../codegen/exec-chain.js";

/**
 * One execution input ("In"); two execution outputs, "Try Body" and "Catch Body" — wiring
 * either emits the wired sub-chain inside the corresponding `try { }`/`catch (err) { }`
 * block; one value output, "Error", readable only from inside the Catch arm (enforced by
 * `schema/validate.ts`'s `tryCatchArmPath`, the same arm-scoping mechanism `logic.promise`'s
 * "value"/"error" pins already use).
 *
 * Like Branch/Switch/Sequence, this node's own `emit()` is a defensive stub that never
 * actually runs — the real compilation lives entirely in `codegen/exec-chain.ts`'s
 * `emitBlock`, which special-cases `node.type === "error.tryCatch"` via `getForkArmPinIds`
 * (returns `["try", "catch"]`), recursively compiles each wired arm as its own independent
 * scope, and assembles a real `try { } catch (err_<id>) { }` statement via
 * `assembleTryCatch`. Unlike Branch's optional `else`/Switch's optional `default`, the
 * `catch` clause is ALWAYS emitted (even with an empty body) since JS's `try` statement
 * requires a `catch` or `finally` and this node has no `finally`.
 *
 * The catch parameter is a per-node-unique identifier (`err_<sanitizedNodeId>`, from
 * `tryCatchErrorIdentifier` in `exec-chain.ts`) rather than a bare `error` — this matches
 * `logic.promise`'s `promiseExecutorParamNames` precedent: a Try-Catch nested inside
 * another Try-Catch's own Catch arm must not have its inner `catch` binding shadow the
 * outer one.
 */
export const tryCatchNode: NodeDefinition = {
  type: "error.tryCatch",
  category: "error",
  label: "Try Catch",
  description:
    'Runs "Try Body"; if it throws, execution jumps to "Catch Body" with the thrown value ' +
    'available on the "Error" output. Compiled by codegen/exec-chain.ts, not by this node\'s own emit().',
  inputs: [{ id: "in", label: "In", kind: "exec" }],
  outputs: [
    { id: "try", label: "Try Body", kind: "exec" },
    { id: "catch", label: "Catch Body", kind: "exec" },
    { id: "error", label: "Error", kind: "value" },
  ],
  configSchema: [],
  emit: () => {
    throw new Error('error.tryCatch is compiled by the exec-chain walker (codegen/exec-chain.ts), not emitted directly');
  },
  resultIdentifier: (node, handle) => {
    if (handle === "error") return tryCatchErrorIdentifier(node.id);
    throw new Error(`Try Catch node "${node.id}" produces no reusable value for output "${handle}"`);
  },
};
