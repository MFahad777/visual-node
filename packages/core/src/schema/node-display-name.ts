import type { FlowNode, VariableDeclaration } from "./node.types.js";
import { getNodeDefinition } from "./node-registry.js";
import type { DiagnosticFrame } from "./diagnostics.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function findVariable(variableId: unknown, scopes: VariableDeclaration[][]): VariableDeclaration | undefined {
  if (typeof variableId !== "string") return undefined;
  for (const scope of scopes) {
    const v = scope.find((v) => v.id === variableId);
    if (v) return v;
  }
  return undefined;
}

/** Must never throw — runs even when validation is what's flagging THIS node's own name/
 *  variableId as invalid elsewhere. */
export function resolveNodeDisplayName(node: FlowNode, variableScopes: VariableDeclaration[][] = []): string {
  if (node.type === "logic.function") {
    const name = String(node.data?.name ?? "").trim();
    return IDENTIFIER_RE.test(name) ? `Function "${name}"` : "Unnamed Function";
  }
  if (node.type === "logic.handlerFunction") {
    const name = String(node.data?.name ?? "").trim();
    return IDENTIFIER_RE.test(name) ? `Handler Function "${name}"` : "Unnamed Handler Function";
  }
  if (node.type === "variable.get" || node.type === "variable.set") {
    const variableId = (node.data as Record<string, unknown> | undefined)?.variableId;
    const variable = findVariable(variableId, variableScopes);
    const verb = node.type === "variable.get" ? "Get" : "Set";
    return variable ? `${verb} "${variable.name}"` : "Unknown Variable";
  }
  return getNodeDefinition(node.type)?.label ?? node.type;
}

export function frameForNode(node: FlowNode, variableScopes: VariableDeclaration[][] = []): DiagnosticFrame {
  return { nodeId: node.id, nodeType: node.type, label: resolveNodeDisplayName(node, variableScopes) };
}
