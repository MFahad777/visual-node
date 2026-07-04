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
  "operators.equal",
  "operators.notEqual",
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
// number/checkbox control gated to one JS type. `variable.set`'s "Value" pin is the same
// situation for the same reason: the variable it's bound to can be any of Phase 10's 14
// `dataType`s, so there's no single fixed literalKind to give it — free-form raw JS text
// (e.g. `0`, `"hi"`, `true`) is the only literal kind flexible enough, and it's exactly what
// `resolveValuePin` already does with an unwired literal (interpolates it as raw JS source).
const TEXT_LITERAL_TYPES = new Set(["controlFlow.switch", "variable.set"]);

export function literalKindFor(type: string | undefined): "number" | "boolean" | "text" | null {
  if (!type) return null;
  if (NUMBER_LITERAL_TYPES.has(type)) return "number";
  if (BOOLEAN_LITERAL_TYPES.has(type)) return "boolean";
  if (TEXT_LITERAL_TYPES.has(type)) return "text";
  return null;
}

/** The value input pin ids on a freshly-created (no dynamic pins yet) instance of `type`. */
function staticLiteralPinIds(type: string, definition: NodeDefinition): string[] {
  if (type === "controlFlow.switch") return ["selection"];
  if (type === "controlFlow.branch") return ["condition"];
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

  return definition.outputs;
}
