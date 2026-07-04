import type { FlowNode } from "../schema/node.types.js";
import type { EmitContext } from "../schema/node-registry.js";
import { resultIdentifierFor } from "./emit-function-graph.js";

export interface ResolveValuePinOptions {
  /** Raw JS text used when the pin has neither an incoming edge nor a `data.literals` entry. */
  defaultLiteral?: string;
}

/**
 * Resolves the generated-code text for one of a node's value input pins: if wired, the
 * upstream node's identifier (via `resultIdentifierFor`); otherwise, the pin's literal
 * default from `node.data.literals`. Shared by every operator and by
 * `controlFlow.branch`'s "condition" / `controlFlow.switch`'s "selection".
 *
 * Interpolates the literal via a template string rather than `JSON.stringify` on purpose —
 * editor-ui's inline literal-editing UI may store a pin's default as a string, a number, or
 * a boolean depending on the control type (text box, number box, checkbox); all three
 * stringify to the same generated code text this way (`"5"`, `5`, and `true` each produce
 * literal `5`/`true` in the output), so the exact JS type editor-ui chooses to store doesn't
 * matter here.
 */
export function resolveValuePin(
  node: FlowNode,
  ctx: EmitContext,
  pinId: string,
  opts: ResolveValuePinOptions = {},
): string {
  const incoming = ctx.getIncoming(node.id, pinId);
  if (incoming.length > 1) {
    throw new Error(`Node "${node.id}" input "${pinId}" has more than one incoming connection`);
  }

  if (incoming[0]) {
    const source = ctx.getNode(incoming[0].source);
    if (!source) {
      throw new Error(`Node "${node.id}" input "${pinId}" references unknown node "${incoming[0].source}"`);
    }
    return `(${resultIdentifierFor(source, incoming[0].sourceHandle, ctx)})`;
  }

  const literal = (node.data as Record<string, unknown> | undefined)?.literals as
    | Record<string, unknown>
    | undefined;
  const value = literal?.[pinId];
  if (value === undefined || String(value).trim() === "") {
    if (opts.defaultLiteral !== undefined) return `(${opts.defaultLiteral})`;
    throw new Error(`Node "${node.id}" input "${pinId}" is not connected and has no literal value`);
  }
  return `(${value})`;
}
