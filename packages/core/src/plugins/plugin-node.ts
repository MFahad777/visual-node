import type { EmitContext, EmittedCode, NodeDefinition } from "../schema/node-registry.js";
import type { FlowNode } from "../schema/node.types.js";
import { sanitizeIdentifier } from "../codegen/emit-function-graph.js";
import { resolveValuePin } from "../codegen/value-pins.js";
import { validatePluginNodeSpec, type PluginNodeSpec } from "./plugin-schema.js";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

/** The identifier a plugin node's own value output (if any) resolves to — shared by both
 * the `emit()`-time `{{result}}` substitution and the `resultIdentifier()` hook so any other
 * node wiring into this one always resolves to the exact same generated-code identifier. */
function pluginResultIdentifier(node: FlowNode): string {
  return sanitizeIdentifier(`plugin_${node.id}`);
}

function renderTemplate(template: string, spec: PluginNodeSpec, node: FlowNode, ctx: EmitContext): string {
  return template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    if (name === "result") {
      return pluginResultIdentifier(node);
    }
    if (name.startsWith("config.")) {
      const key = name.slice("config.".length);
      const field = spec.configSchema.find((f) => f.key === key);
      const value = (node.data as Record<string, unknown> | undefined)?.[key] ?? field?.default;
      if (field?.type === "code") {
        return String(value ?? "");
      }
      return JSON.stringify(value);
    }
    // Otherwise: a declared "value"-kind input pin id, per validatePluginNodeSpec's contract.
    return resolveValuePin(node, ctx, name, { defaultLiteral: "undefined" });
  });
}

/**
 * Builds a real `NodeDefinition` from a validated `PluginNodeSpec`. Callers must have already
 * run `validatePluginNodeSpec(spec)` and confirmed it returned no errors — this function
 * re-checks cheaply and throws if that contract was violated, but does not repeat the full
 * validation pass's error reporting.
 */
export function createPluginNodeDefinition(spec: PluginNodeSpec): NodeDefinition {
  const errors = validatePluginNodeSpec(spec);
  if (errors.length > 0) {
    throw new Error(`Cannot create a node definition from an invalid plugin spec "${spec.type}": ${errors.join("; ")}`);
  }

  const hasValueOutput = spec.outputs.some((o) => o.kind === "value");

  const definition: NodeDefinition = {
    type: spec.type,
    category: spec.category,
    label: spec.label,
    description: spec.description,
    inputs: spec.inputs.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
    outputs: spec.outputs.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
    configSchema: spec.configSchema.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.options,
      default: f.default,
      hint: f.hint,
    })),
    npmDependencies: spec.npmDependencies,
    requiresAsync: spec.async === true,
    emit: (node: FlowNode, ctx: EmitContext): EmittedCode => {
      const emitted: EmittedCode = { order: spec.codegen.order ?? 0 };
      if (spec.codegen.imports) {
        emitted.imports = spec.codegen.imports.map((template) => renderTemplate(template, spec, node, ctx));
      }
      if (spec.codegen.setup !== undefined) {
        emitted.setup = renderTemplate(spec.codegen.setup, spec, node, ctx);
      }
      if (spec.codegen.body !== undefined) {
        emitted.body = renderTemplate(spec.codegen.body, spec, node, ctx);
      }
      return emitted;
    },
  };

  if (hasValueOutput) {
    definition.resultIdentifier = (node: FlowNode) => pluginResultIdentifier(node);
  }

  return definition;
}
