import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

interface ExtraSource {
  id: string;
}

function getExtraSources(node: { data?: Record<string, any> }): ExtraSource[] {
  return Array.isArray(node.data?.extraSources) ? (node.data!.extraSources as ExtraSource[]) : [];
}

/**
 * Merges objects using Object.assign(target, source0, source1, ...). Exec pass-through
 * (one exec-in, one exec-out) with variadic value-input Source pins.
 * The "Target" and "Source 0" pins are always present; additional sources are grown/shrunk
 * on canvas via "+ Add Source"/"×" using stable ids, following the pattern from logic.callback.
 *
 * Object.assign silently skips null/undefined sources, so unwired pins resolve to undefined
 * via the standard defaultLiteral mechanism — no custom "is this wired" check needed.
 */
export const assignNode: NodeDefinition = {
  type: "object.assign",
  category: "object",
  label: "Object Assign",
  description:
    "Merges objects using Object.assign(). The result is the target object with all source " +
    "properties assigned to it (sources are applied left-to-right; later ones override earlier ones).",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "target", label: "Target", kind: "value" },
    { id: "source-0", label: "Source 0", kind: "value" },
  ],
  outputs: [
    { id: "out", label: "Next", kind: "exec" },
    { id: "result", label: "Result", kind: "value" },
  ],
  configSchema: [],
  emit: (node, ctx) => {
    const targetExpr = resolveValuePin(node, ctx, "target", { defaultLiteral: "{}" });
    const source0Expr = resolveValuePin(node, ctx, "source-0", { defaultLiteral: "undefined" });

    // Gather all extra source expressions
    const extraSourceExprs = getExtraSources(node).map((s) =>
      resolveValuePin(node, ctx, `source-${s.id}`, { defaultLiteral: "undefined" }),
    );

    // Build the full argument list: target, source-0, source-1, ...
    const allSourceExprs = [source0Expr, ...extraSourceExprs];
    const resultVar = `_objassign_${sanitizeIdentifier(node.id)}`;

    return {
      body: `const ${resultVar} = Object.assign(${targetExpr}, ${allSourceExprs.join(", ")});`,
      order: 0,
    };
  },
  resultIdentifier: (node) => `_objassign_${sanitizeIdentifier(node.id)}`,
};
