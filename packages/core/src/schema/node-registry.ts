import type { Flow, FlowEdge, FlowNode } from "./node.types.js";

export type NodeCategory =
  | "server"
  | "routing"
  | "middleware"
  | "handler"
  | "logic"
  | "debugging"
  | "operators"
  | "controlFlow";

export interface PortDefinition {
  id: string;
  label: string;
  /**
   * Whether this port represents execution flow (rendered as a white arrowhead, wired with
   * a plain white edge) or a value (colored circle). Optional for backward compatibility —
   * every node type registered before Phase 7 omits this and instead relies on editor-ui's
   * legacy "in"/"out" id-naming-convention fallback. Every Phase 7+ port sets this
   * explicitly, since Branch's "true"/"false" and Switch's per-case outputs can't be
   * expressed as a fixed id whitelist.
   */
  kind?: "exec" | "value";
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "code" | "boolean";
  options?: string[];
  default?: any;
  /** Short help text shown under the field's label, e.g. documenting variables available inside a "code" field. */
  hint?: string;
}

export interface EmittedCode {
  /** require()/import statements this node contributes. Deduped by the assembler. */
  imports?: string[];
  /** Top-level statement(s), e.g. `const app = express();` or a full route registration. */
  setup?: string;
  /** Code that belongs inside a request handler body (only meaningful for "handler" category nodes). */
  body?: string;
  /** Hint used to order emitted `setup` fragments in the final file, independent of graph position. */
  order: number;
}

export interface EmitContext {
  flow: Flow;
  /** Edges whose target is the given node id (optionally filtered to a specific input handle). */
  getIncoming: (nodeId: string, handle?: string) => FlowEdge[];
  /** Edges whose source is the given node id (optionally filtered to a specific output handle). */
  getOutgoing: (nodeId: string, handle?: string) => FlowEdge[];
  getNode: (nodeId: string) => FlowNode | undefined;
  /** Emits a single node in isolation (used to pull a handler chain's `body` into an owning route). */
  emitNode: (nodeId: string) => EmittedCode;
}

export interface NodeDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: ConfigField[];
  emit: (node: FlowNode, ctx: EmitContext) => EmittedCode;
  /**
   * The identifier another node references to read this node's value output. Omitted by
   * nodes that produce no reusable value (e.g. handler/control-flow nodes). `handle` is
   * only meaningful for nodes with multiple named value outputs (today: only
   * `logic.graphEntry`, one value per function parameter) — every other case ignores it.
   */
  resultIdentifier?: (node: FlowNode, handle?: string, ctx?: EmitContext) => string;
  /**
   * Fixed, node-TYPE-level npm dependencies always needed when any instance of this type is
   * placed on canvas (distinct from per-instance dependency declarations elsewhere). Optional;
   * no builtin node currently sets this.
   */
  npmDependencies?: Record<string, string>;
  /**
   * True if this node type's emit() output requires an `await`-capable (async) enclosing
   * function scope. Optional; no builtin node currently sets this to true.
   */
  requiresAsync?: boolean;
}

const registry = new Map<string, NodeDefinition>();

export function registerNode(def: NodeDefinition): void {
  if (registry.has(def.type)) {
    throw new Error(`Node type "${def.type}" is already registered`);
  }
  registry.set(def.type, def);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return registry.get(type);
}

export function requireNodeDefinition(type: string): NodeDefinition {
  const def = registry.get(type);
  if (!def) {
    throw new Error(`Unknown node type "${type}" — is it registered in the node registry?`);
  }
  return def;
}

export function listNodeDefinitions(): NodeDefinition[] {
  return Array.from(registry.values());
}

export function clearRegistry(): void {
  registry.clear();
}
