import type { FlowNode } from "../../schema/node.types.js";
import type { EmitContext, NodeDefinition } from "../../schema/node-registry.js";
import { emitFunctionGraphBody, FunctionGraphError, type FunctionGraph } from "../../codegen/emit-function-graph.js";
import { promiseExecutorParamNames, mergeEnclosingPromiseParams } from "../../codegen/exec-chain.js";

export class PromiseBodyGraphError extends Error {
  constructor(
    message: string,
    public readonly promiseNodeId: string,
    public readonly blueprintNodeId?: string,
  ) {
    super(message);
  }
}

const promiseNodeDefinition: NodeDefinition = {
  type: "logic.promise",
  category: "logic",
  label: "Promise",
  description: "Construct and handle promises with optional await, then/catch arms, or variable binding",
  inputs: [{ id: "in", label: "In", kind: "exec" }],
  outputs: [
    { id: "out", label: "Next", kind: "exec" },
    { id: "then", label: "Then", kind: "exec" },
    { id: "catch", label: "Catch", kind: "exec" },
    { id: "assign", label: "Assign", kind: "value" },
    { id: "value", label: "Value", kind: "value" },
    { id: "error", label: "Error", kind: "value" },
  ],
  configSchema: [
    {
      key: "mode",
      label: "Authoring Mode",
      type: "select",
      options: ["code", "blueprint"],
      default: "code",
    },
    {
      key: "body",
      label: "Executor Body",
      type: "code",
      default: "",
      hint: "Code mode only. Must call resolve() or reject() to complete the promise.",
    },
    {
      key: "npmDependencies",
      label: "npm Dependencies",
      type: "text",
      default: "",
      hint: "Code mode only. Comma-separated package names.",
    },
    {
      key: "awaited",
      label: "Await",
      type: "boolean",
      default: false,
      hint: "When enabled, this Promise will be awaited inline. When disabled, wire Then/Catch arms.",
    },
    {
      key: "wrapInIife",
      label: "Wrap In IIFE",
      type: "boolean",
      default: true,
      hint: "Await-only. Only matters when this chain has no async-capable enclosing function to bubble into (e.g. hanging off a Begin node) — Route/Function/Handler Function nodes already have their own Async checkbox instead. When off, the awaited expression is emitted bare, with no fire-and-forget wrapper — only valid where the enclosing scope is already async.",
    },
  ],
  emit: () => {
    throw new Error(
      "Promise node is handled entirely by exec-chain.ts's special-case branch; emit() should never be called. " +
        "If you see this, there's a bug in the execution-chain walker."
    );
  },
  promiseExecutor: (node: FlowNode, ctx: EmitContext) => {
    const data = node.data as Record<string, unknown> | undefined;
    const mode = data?.mode === "blueprint" ? "blueprint" : "code";

    if (mode === "code") {
      const body = String(data?.body ?? "");
      const npmDeps = parseDependencies(String(data?.npmDependencies ?? ""));
      return {
        code: body,
        imports: npmDeps,
        requiresAsync: false,
      };
    }

    // Blueprint mode
    const graph: FunctionGraph = (data?.graph as any) ?? { nodes: [], edges: [], variables: [] };
    try {
      const result = emitFunctionGraphBody(
        graph,
        ctx.flow.variables ?? [],
        promiseExecutorParamNames(node.id),
        mergeEnclosingPromiseParams(ctx),
      );
      return {
        code: result.code,
        imports: result.imports,
        requiresAsync: result.requiresAsync,
      };
    } catch (err) {
      const inner = err instanceof FunctionGraphError ? err : new FunctionGraphError(err instanceof Error ? err.message : String(err));
      throw new PromiseBodyGraphError(
        `Promise node executor blueprint graph error: ${inner.message}`,
        node.id,
        inner.nodeId,
      );
    }
  },
  requiresAsync: (node: FlowNode) => {
    return (node.data as Record<string, unknown> | undefined)?.awaited === true;
  },
  resultIdentifier: (node, handle) => {
    // Bare "value"/"error" — must match exec-chain.ts's `.then((value) => ...)` /
    // `.catch((error) => ...)` callback parameter names exactly, since that's the real
    // JS scope these identifiers are read from. validate.ts's `promiseArmPath` already
    // rejects a reader outside the corresponding arm, so by the time this runs the
    // reference is known to be safely in-scope.
    if (handle === "value") return "value";
    if (handle === "error") return "error";
    throw new Error(`Promise node "${node.id}" produces no reusable value for output "${handle}"`);
  },
};

function parseDependencies(raw: string): string[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return Object.keys(parsed).map((key) => {
        const version = (parsed as Record<string, any>)[key];
        return typeof version === "string" ? `${key}@${version}` : key;
      });
    }
  } catch {
    // Fall through to comma-split
  }
  return raw.split(",").map((s) => s.trim()).filter((s) => s);
}

export default promiseNodeDefinition;
