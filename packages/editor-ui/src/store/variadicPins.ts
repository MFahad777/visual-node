import type { Node, Edge } from "@xyflow/react";
import {
  getSwitchCases,
  getSequencePins,
  getPathExtractorParamCount,
  getCallbackArgs,
  functionAllowedInputHandles,
  functionAllowedOutputHandles,
  type SwitchCase,
  type SequencePin,
  type CallbackArg,
  type FunctionUsage,
} from "../canvas/effectivePorts.js";

/**
 * Pure node/edge-mutation helpers for the two Phase 7 "dynamic pin count" node families:
 * AND/NAND/OR/NOR/XOR's variadic boolean value-inputs, and Switch's per-case exec-outputs.
 * Operate on plain react-flow `Node[]`/`Edge[]` so both `store/flowStore.ts` (main canvas)
 * and `store/functionGraphStore.ts` (Function Graph sub-canvas) can share the exact same
 * semantics instead of each re-deriving them.
 */

/**
 * Appends a new boolean input pin (`extra-<seq>`) to a variadic boolean node. `nextInputSeq`
 * is a monotonic counter, never reused even after removals — so a pin id is never re-minted
 * and stale wiring/config referencing a removed pin id can never collide with a new one.
 */
export function addVariadicInputPin(node: Node): Node {
  const extra: string[] = Array.isArray(node.data?.extraInputs) ? (node.data!.extraInputs as string[]) : [];
  const seq = Number(node.data?.nextInputSeq ?? 0);
  const pinId = `extra-${seq}`;
  return { ...node, data: { ...node.data, extraInputs: [...extra, pinId], nextInputSeq: seq + 1 } };
}

/** Removes one dynamic input pin from a variadic boolean node, dropping any wire targeting it. */
export function removeVariadicInputPin(
  nodeId: string,
  pinId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            data: {
              ...n.data,
              extraInputs: (Array.isArray(n.data?.extraInputs) ? (n.data.extraInputs as string[]) : []).filter(
                (p) => p !== pinId,
              ),
            },
          }
        : n,
    ),
    edges: edges.filter((e) => !(e.target === nodeId && e.targetHandle === pinId)),
  };
}

/**
 * Appends a new case to a Switch node's `data.cases`, with a stable `id` (a monotonic
 * `nextCaseSeq` counter, never reused — same pattern as `addVariadicInputPin`'s
 * `nextInputSeq`) and a placeholder `value` the user immediately edits in the config panel's
 * Cases list. `id` and `value` are intentionally decoupled: editing a case's value later
 * (`updateSwitchCaseValue`) never changes its pin id, so existing wiring survives.
 */
export function addSwitchCase(node: Node): Node {
  const cases = getSwitchCases(node.data as Record<string, unknown>);
  const seq = Number(node.data?.nextCaseSeq ?? 0);
  const newCase: SwitchCase = { id: String(seq), value: 0 };
  return { ...node, data: { ...node.data, cases: [...cases, newCase], nextCaseSeq: seq + 1 } };
}

/** Removes one case from a Switch node by its stable id, dropping any wire sourced from its exec-output pin. */
export function removeSwitchCase(
  nodeId: string,
  caseId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const pinId = `case-${caseId}`;
  return {
    nodes: nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, cases: getSwitchCases(n.data as Record<string, unknown>).filter((c) => c.id !== caseId) } } : n,
    ),
    edges: edges.filter((e) => !(e.source === nodeId && e.sourceHandle === pinId)),
  };
}

/**
 * Appends a new execution-output pin (`then-<seq>`) to a Sequence node. `nextPinSeq` is a
 * monotonic counter, never reused — same convention as `addSwitchCase`'s `nextCaseSeq`.
 * Unlike Switch's cases, a Sequence pin carries no per-pin config value — it's purely an
 * ordering slot. Starts from 1 to avoid colliding with the static "then-0" pin defined
 * in sequence.node.ts.
 */
export function addSequencePin(node: Node): Node {
  const pins = getSequencePins(node.data as Record<string, unknown>);
  const seq = Number(node.data?.nextPinSeq ?? 1);
  const newPin: SequencePin = { id: String(seq) };
  return { ...node, data: { ...node.data, pins: [...pins, newPin], nextPinSeq: seq + 1 } };
}

/** Removes one dynamic pin from a Sequence node by its stable id, dropping any wire sourced from its exec-output pin. */
export function removeSequencePin(
  nodeId: string,
  pinId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const handle = `then-${pinId}`;
  return {
    nodes: nodes.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, pins: getSequencePins(n.data as Record<string, unknown>).filter((p) => p.id !== pinId) } }
        : n,
    ),
    edges: edges.filter((e) => !(e.source === nodeId && e.sourceHandle === handle)),
  };
}

/**
 * Increments a Path Extractor node's `paramCount`, appending one more `param-<N>` value-input
 * pin. Unlike `addVariadicInputPin`'s stable-id array, this is a plain counter — removal
 * (`removePathExtractorParam`) always targets the highest-index pin, per product decision, so
 * there's no need for a monotonic never-reused id sequence here.
 */
export function addPathExtractorParam(node: Node): Node {
  const count = getPathExtractorParamCount(node.data as Record<string, unknown>);
  return { ...node, data: { ...node.data, paramCount: count + 1 } };
}

/** Removes the highest-index `param-<N>` pin from a Path Extractor node, dropping any wire targeting it. */
export function removePathExtractorParam(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const node = nodes.find((n) => n.id === nodeId);
  const count = getPathExtractorParamCount(node?.data as Record<string, unknown>);
  if (count === 0) return { nodes, edges };
  const removedPinId = `param-${count - 1}`;
  return {
    nodes: nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, paramCount: count - 1 } } : n)),
    edges: edges.filter((e) => !(e.target === nodeId && e.targetHandle === removedPinId)),
  };
}

/**
 * Appends a new argument pin (`arg-<seq>`) to a Callback node's `data.args`. `nextArgSeq` is
 * a monotonic counter, never reused — same convention as `addSequencePin`'s `nextPinSeq`.
 * Unlike Sequence (an exec-output stable-id list), this is a value-INPUT stable-id list, so
 * removal (`removeCallbackArg`) drops an incoming wire, not an outgoing one.
 */
export function addCallbackArg(node: Node): Node {
  const args = getCallbackArgs(node.data as Record<string, unknown>);
  const seq = Number(node.data?.nextArgSeq ?? 0);
  const newArg: CallbackArg = { id: String(seq) };
  return { ...node, data: { ...node.data, args: [...args, newArg], nextArgSeq: seq + 1 } };
}

/** Removes one dynamic arg pin from a Callback node by its stable id, dropping any wire targeting it. */
export function removeCallbackArg(
  nodeId: string,
  argId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const handle = `arg-${argId}`;
  return {
    nodes: nodes.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, args: getCallbackArgs(n.data as Record<string, unknown>).filter((a) => a.id !== argId) } }
        : n,
    ),
    edges: edges.filter((e) => !(e.target === nodeId && e.targetHandle === handle)),
  };
}

/**
 * Sets a `logic.function` instance's `usage` ("callback" | "standalone") and drops any edge
 * touching this node whose handle isn't allowed under the new usage — e.g. switching to
 * "standalone" removes the "Assign / Parameter" output wire and any wired `param-<i>` input,
 * switching to "callback" removes the "Function" exec-out wire. Uses the same
 * `functionAllowedInputHandles`/`functionAllowedOutputHandles` helpers `effectivePorts.ts`'s
 * `computeEffectiveInputs`/`computeEffectiveOutputs` use for rendering, so a pin that's about
 * to disappear from the canvas never keeps a dangling edge reference.
 */
export function setFunctionUsage(
  nodeId: string,
  usage: FunctionUsage,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const node = nodes.find((n) => n.id === nodeId);
  const allowedInputs = functionAllowedInputHandles(usage, node?.data as Record<string, unknown> | undefined);
  const allowedOutputs = functionAllowedOutputHandles(usage);
  return {
    nodes: nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, usage } } : n)),
    edges: edges.filter((e) => {
      if (e.target === nodeId && e.targetHandle && !allowedInputs.has(e.targetHandle)) return false;
      if (e.source === nodeId && e.sourceHandle && !allowedOutputs.has(e.sourceHandle)) return false;
      return true;
    }),
  };
}

/** Updates one case's user-provided match value, keyed by its stable id (never its value). */
export function updateSwitchCaseValue(nodeId: string, caseId: string, value: string | number | boolean, nodes: Node[]): Node[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? {
          ...n,
          data: {
            ...n.data,
            cases: getSwitchCases(n.data as Record<string, unknown>).map((c) => (c.id === caseId ? { ...c, value } : c)),
          },
        }
      : n,
  );
}
