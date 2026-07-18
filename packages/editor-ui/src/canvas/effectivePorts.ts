import type { NodeDefinition, PortDefinition } from "@visual-node/core";

/**
 * AND/NAND/OR/NOR/XOR support a variable number of boolean value inputs beyond their two
 * static `a`/`b` pins, added/removed live via `store/variadicPins.ts`'s
 * `addVariadicInputPin`/`removeVariadicInputPin`. NOT is excluded — it's the one unary
 * boolean op and has no "+ Add pin" affordance.
 */
export const VARIADIC_BOOLEAN_TYPES = new Set([
  "operators.and",
  "operators.nand",
  "operators.or",
  "operators.nor",
  "operators.xor",
]);

/**
 * Which node types get inline literal editing (a small number/checkbox rendered on an
 * unconnected value pin, bound to `node.data.literals[portId]`) — an explicit allowlist so
 * no pre-Phase-7 node type's rendering changes. Every input pin on a given type shares the
 * same kind (e.g. every input on `operators.add`, including dynamic `extraInputs` ones on
 * the variadic boolean types, is numeric/boolean respectively), so this only needs to key
 * off the node type, not the individual pin. Exported (not GenericNode-local) so
 * `flowStore.ts` can seed a matching default into `data.literals` at node-creation time —
 * without that, a freshly-added node visually shows "0"/unchecked in its literal boxes but
 * `validate.ts`'s "literal required if unwired" check has nothing in `data.literals` to see,
 * so it fails validation the instant it's created, before the user has touched anything.
 */
const NUMBER_LITERAL_TYPES = new Set([
  "operators.add",
  "operators.subtract",
  "operators.multiply",
  "operators.divide",
  "operators.modulo",
  "operators.greaterThan",
  "operators.lessThan",
  "operators.greaterOrEqual",
  "operators.lessOrEqual",
]);
const BOOLEAN_LITERAL_TYPES = new Set([
  "operators.and",
  "operators.nand",
  "operators.or",
  "operators.nor",
  "operators.xor",
  "operators.not",
  "controlFlow.branch",
]);
// Switch's "Selection" accepts any type (number, string, or boolean) — its case values are
// fully user-defined, so unlike every other literal pin, its inline box is free-form raw JS
// text (the same convention used everywhere else literal text is stored) rather than a
// number/checkbox control gated to one JS type. `variable.set`'s "Value" pin gets the same
// baseline "text" kind here (this function only knows the node's static `type`, never the
// bound variable) — but `GenericNode.tsx` refines it further for `variable.set` once a
// `variableId` is actually bound: a plain box holding the RAW per-type value (e.g. `hi`, not
// `"hi"`), which `variable-set.node.ts`'s `emit()` formats into real JS source via
// `formatLiteralForType`, keyed by the bound variable's `dataType` — so, unlike Switch's
// Selection, a `variable.set` literal is never interpreted as raw JS source to hand-splice.
// `logic.graphReturn`'s "Value" pin is the same: it can hold any type (string/number/
// boolean/expression), so it gets the same free-form raw-JS-text box, keyed only off the
// node's static type the same way the others are (no per-instance refinement needed, unlike
// `variable.set`).
// `operators.equal`/`operators.notEqual` (Phase 13) join this group too — `===`/`!==` are
// meaningful across every JS type, unlike the arithmetic/ordering ops which stay numeric-only.
// `array.push`/`array.unshift`'s "Value" and `array.includes`/`array.indexOf`'s "Search
// Element" (Phase 17) also join this group — any JS type, free-form raw JS text — but unlike
// `variable.set`/`logic.graphReturn` (which have exactly one non-exec input pin, so the
// generic `staticLiteralPinIds` fallback naturally targets only it), these 4 types have a
// second non-exec pin ("array") that must NOT get inline literal editing (it should always be
// wired to a real array), so `staticLiteralPinIds` below special-cases them explicitly.
// `logic.pathExtractor`'s dynamic `param-<N>` pins (Phase 18) join this group too — like
// Switch's Selection, a param can be any JS type, free-form raw JS text. Its static "Object"
// pin must NOT get inline literal editing (always wired to a real object), so
// `staticLiteralPinIds` below returns `[]` for it — the dynamic param pins are instead gated
// directly in `GenericNode.tsx` (via `getPathExtractorParamCount`), since this function only
// knows a type's static shape, never a specific instance's `data`.
const TEXT_LITERAL_TYPES = new Set([
  "controlFlow.switch",
  "variable.set",
  "logic.graphReturn",
  "error.throw",
  "operators.equal",
  "operators.notEqual",
  "array.push",
  "array.unshift",
  "array.includes",
  "array.indexOf",
  "logic.pathExtractor",
]);

export function literalKindFor(type: string | undefined): "number" | "boolean" | "text" | null {
  if (!type) return null;
  if (NUMBER_LITERAL_TYPES.has(type)) return "number";
  if (BOOLEAN_LITERAL_TYPES.has(type)) return "boolean";
  if (TEXT_LITERAL_TYPES.has(type)) return "text";
  return null;
}

/**
 * The value input pin ids on a freshly-created (no dynamic pins yet) instance of `type` that
 * get inline literal editing. Exported (not just used by `defaultLiteralsFor` below) so
 * `GenericNode.tsx` can gate its per-port literal box on this same list — needed since Phase
 * 17's `array.push`/`array.unshift`/`array.includes`/`array.indexOf` are the first
 * `TEXT_LITERAL_TYPES` entries with a SECOND non-exec input pin ("array") that must never get
 * inline literal editing (it should always be wired to a real array). Every pre-existing
 * `TEXT_LITERAL_TYPES`/`NUMBER_LITERAL_TYPES`/`BOOLEAN_LITERAL_TYPES` type either has exactly
 * one non-exec input pin, or (operators) wants literal editing on all of them — both already
 * match this function's generic fallback, so gating on it changes no existing type's behavior.
 */
export function staticLiteralPinIds(type: string, definition: NodeDefinition): string[] {
  if (type === "controlFlow.switch") return ["selection"];
  if (type === "controlFlow.branch") return ["condition"];
  if (type === "array.push" || type === "array.unshift") return ["value"];
  if (type === "array.includes" || type === "array.indexOf") return ["searchElement"];
  if (type === "logic.pathExtractor") return [];
  return definition.inputs.filter((p) => p.kind !== "exec").map((p) => p.id);
}

/**
 * Seeds `data.literals` with the same default every unwired literal box displays (`0` for
 * numeric pins, `false` for boolean pins, `"0"` raw text for Switch's Selection) so a
 * brand-new node's `data` already matches what's rendered, and `validate.ts`'s
 * literal-required-if-unwired check passes immediately instead of flagging every fresh node
 * as an error before the user has interacted with it.
 */
export function defaultLiteralsFor(type: string, definition: NodeDefinition): Record<string, number | boolean | string> | undefined {
  const kind = literalKindFor(type);
  if (!kind) return undefined;
  const pinIds = staticLiteralPinIds(type, definition);
  if (pinIds.length === 0) return undefined;
  const value = kind === "number" ? 0 : kind === "boolean" ? false : "0";
  return Object.fromEntries(pinIds.map((id) => [id, value]));
}

export interface SwitchCase {
  id: string;
  value: string | number | boolean;
}

export function getSwitchCases(data: Record<string, unknown> | undefined): SwitchCase[] {
  return Array.isArray(data?.cases) ? (data!.cases as SwitchCase[]) : [];
}

export interface SequencePin {
  id: string;
}

export function getSequencePins(data: Record<string, unknown> | undefined): SequencePin[] {
  return Array.isArray(data?.pins) ? (data!.pins as SequencePin[]) : [];
}

/**
 * How a `logic.function` instance is meant to be used, chosen via `FunctionUsageMenu` at
 * creation time (or changed later from the config panel) — `undefined` means "no choice
 * was ever made" (every pre-existing node from before this concept existed), which must
 * keep rendering with BOTH pin sets below for backward compatibility.
 */
export type FunctionUsage = "callback" | "standalone";

function functionParamPinIds(data: Record<string, unknown> | undefined): string[] {
  return String(data?.params ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((_, i) => `param-${i}`);
}

/** Value-input pin ids a `logic.function` instance has under a given usage — `"standalone"`
 * drops every wireable default-value param pin (Parameters goes back to plain text, as it
 * was pre-Phase-20); `"callback"`/`undefined` (legacy) keep them. */
export function functionAllowedInputHandles(usage: FunctionUsage | undefined, data: Record<string, unknown> | undefined): Set<string> {
  if (usage === "standalone") return new Set();
  return new Set(functionParamPinIds(data));
}

/** Output pin ids a `logic.function` instance has under a given usage — `"callback"` drops
 * the exec-out "Function" pin (no execution pin on either side); `"standalone"` drops the
 * "Assign / Parameter" value pin; `undefined` (legacy, no choice ever made) keeps both. */
export function functionAllowedOutputHandles(usage: FunctionUsage | undefined): Set<string> {
  if (usage === "callback") return new Set(["value"]);
  if (usage === "standalone") return new Set(["out"]);
  return new Set(["out", "value"]);
}

/** Output pin ids a `logic.promise` instance has when awaited — hides then/catch/value/error,
 * leaving only out and assign visible (the exec-continuation and variable-binding pins).
 * When awaited is false, all pins remain visible. */
export function promiseAllowedOutputHandles(awaited: boolean): Set<string> {
  if (awaited) return new Set(["out", "assign"]);
  return new Set(["out", "then", "catch", "assign", "value", "error"]);
}

export interface CallbackArg {
  id: string;
}

/** Stable-id array of a `logic.callback` instance's dynamic `arg-<id>` value-input pins —
 * same convention as `getSequencePins`, so removing an arg from the middle never disturbs
 * another arg's wiring. */
export function getCallbackArgs(data: Record<string, unknown> | undefined): CallbackArg[] {
  return Array.isArray(data?.args) ? (data!.args as CallbackArg[]) : [];
}

/**
 * Number of dynamic `param-<N>` value-input pins on a `logic.pathExtractor` instance.
 * Unlike Sequence/Switch's per-pin stable-id arrays, this is a plain counter — removal
 * always targets the highest-index pin (`- Remove Param`), so there's no need to track
 * individual pin identity across additions/removals.
 */
export function getPathExtractorParamCount(data: Record<string, unknown> | undefined): number {
  return Math.max(0, Number(data?.paramCount ?? 0));
}

/**
 * Computes a node instance's actual input ports, layering per-instance dynamic pins on top
 * of the node type's static `NodeDefinition.inputs`. Shared by `GenericNode.tsx` (rendering)
 * and `CustomEdge.tsx` (wire-kind/coloring) so the two can never disagree about a dynamically
 * synthesized pin's shape.
 */
export function computeEffectiveInputs(
  type: string | undefined,
  data: Record<string, unknown> | undefined,
  definition: NodeDefinition,
): PortDefinition[] {
  if (type === "logic.functionCall") {
    return [
      ...definition.inputs,
      ...String(data?.params ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((paramName, i) => ({ id: `param-${i}`, label: paramName })),
    ];
  }

  if (type && VARIADIC_BOOLEAN_TYPES.has(type)) {
    const extra: string[] = Array.isArray(data?.extraInputs) ? (data!.extraInputs as string[]) : [];
    return [...definition.inputs, ...extra.map((pinId) => ({ id: pinId, label: "" }))];
  }

  if (type === "logic.pathExtractor") {
    const count = getPathExtractorParamCount(data);
    return [
      ...definition.inputs,
      ...Array.from({ length: count }, (_, i) => ({ id: `param-${i}`, label: `Param ${i}`, kind: "value" as const })),
    ];
  }

  if (type === "logic.function") {
    // One dynamic `param-<i>` value-input pin per parsed parameter name, for an optional JS
    // default value (`function f(a = <wired-or-literal>) {...}`) — positional like
    // `logic.functionCall`'s own `param-<i>` pins above, so renaming a parameter's text
    // doesn't dangle its wire, only its displayed label. A `"standalone"`-usage instance
    // (FunctionUsageMenu / config panel "Usage" toggle) drops these entirely, reverting
    // Parameters to plain non-wireable text like it was pre-Phase-20.
    const usage = data?.usage as FunctionUsage | undefined;
    if (usage === "standalone") return [...definition.inputs];
    return [
      ...definition.inputs,
      ...String(data?.params ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((paramName, i) => ({ id: `param-${i}`, label: paramName, kind: "value" as const })),
    ];
  }

  if (type === "logic.callback") {
    // Live-index label (not the stored id), same convention as Sequence's `then-<id>` pins —
    // removing a middle arg relabels the remainder without renumbering ids/wires.
    return [
      ...definition.inputs,
      ...getCallbackArgs(data).map((a, i) => ({ id: `arg-${a.id}`, label: `Arg ${i + 1}`, kind: "value" as const })),
    ];
  }

  return definition.inputs;
}

/**
 * Computes a node instance's actual output ports, layering per-instance dynamic pins on top
 * of the node type's static `NodeDefinition.outputs`. Shared by `GenericNode.tsx` (rendering)
 * and `CustomEdge.tsx` (wire-kind/coloring) so the two can never disagree about a dynamically
 * synthesized pin's shape.
 */
export function computeEffectiveOutputs(
  type: string | undefined,
  data: Record<string, unknown> | undefined,
  definition: NodeDefinition,
): PortDefinition[] {
  if (type === "logic.graphEntry") {
    return [
      // Static execution pin declared on the node definition (`out` / "Next"), followed
      // by one dynamic value pin per current parameter name — same append pattern as
      // logic.functionCall's `param-<N>` pins above.
      ...definition.outputs,
      ...(Array.isArray(data?.params) ? (data!.params as string[]) : []).map((name) => ({ id: name, label: name })),
    ];
  }

  if (type === "logic.function") {
    // "callback" drops the exec-out "Function" pin (no execution pin on either side);
    // "standalone" drops the "Assign / Parameter" value pin; `undefined` (legacy — no
    // choice was ever made, e.g. every pre-existing `.blueprint` file) keeps both, exactly
    // matching pre-this-feature behavior.
    const usage = data?.usage as FunctionUsage | undefined;
    const allowed = functionAllowedOutputHandles(usage);
    return definition.outputs.filter((p) => allowed.has(p.id));
  }

  if (type === "logic.promise") {
    // When awaited, hide then/catch/value/error pins, leaving only out and assign visible.
    // When not awaited, show all pins. Mirrors logic.function's usage-gated filtering.
    const awaited = (data as Record<string, unknown> | undefined)?.awaited === true;
    if (!awaited) return definition.outputs;
    const allowed = promiseAllowedOutputHandles(awaited);
    return definition.outputs.filter((p) => allowed.has(p.id));
  }

  if (type === "controlFlow.switch") {
    // Case pins first, Default last (definition.outputs is just `[{id:"default",...}]`) —
    // matches the reference layout. `kind: "exec"` is set explicitly since these pins are
    // synthesized here and don't exist in the static NodeDefinition — without it they'd fall
    // through isExecPort's legacy "in"/"out" fallback and render as value circles. The pin's
    // label is the case's user-provided `value` (any type), not its stable `id` — id and
    // value are intentionally decoupled so editing a case's value in the config panel never
    // re-targets its wire.
    return [
      ...getSwitchCases(data).map((c) => ({ id: `case-${c.id}`, label: String(c.value), kind: "exec" as const })),
      ...definition.outputs,
    ];
  }

  if (type === "controlFlow.sequence") {
    // "then-0" (definition.outputs[0]) first, then dynamic pins in the order they were added —
    // append order IS pin order here (unlike Switch, where display order doesn't carry
    // codegen meaning). Label is a live display index, not the stored id, so removing a
    // middle pin relabels the remainder without renumbering their stored ids/wires.
    return [
      ...definition.outputs,
      ...getSequencePins(data).map((p, i) => ({ id: `then-${p.id}`, label: `Then ${i + 1}`, kind: "exec" as const })),
    ];
  }

  return definition.outputs;
}
