import type { Flow, FlowEdge, FlowNode } from "./node.types.js";

export type NodeCategory =
  | "server"
  | "routing"
  | "middleware"
  | "handler"
  | "logic"
  | "debugging"
  | "operators"
  | "controlFlow"
  | "array";

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

/**
 * Declares a node as a "loop container" (a single execution-body arm that repeats per
 * element, plus a normal trunk-continuation pin) — structurally different from a Branch/
 * Switch/Sequence fork, whose arms are all block-terminal. `bodyPin`'s target is compiled
 * as a nested scope (like a fork arm); `completedPin`'s target continues in the SAME scope
 * as the loop node itself, since after the assembled `.map()`/`.reduce()`/etc. statement,
 * execution just continues in the enclosing block. `contextPinIds` lists the node's own
 * value-output pins that are only meaningful inside `bodyPin`'s nested scope (e.g.
 * `element`/`index`/`arrayRef`/`accumulator`) — used by `validate.ts` to reject reading them
 * from outside the loop body. Data-driven (like `execEntryPort` keys off port `kind`) rather
 * than a hardcoded type-string list in `exec-chain.ts`, so any future loop-shaped node type
 * gets the same treatment for free.
 */
export interface LoopShape {
  bodyPin: string;
  completedPin: string;
  contextPinIds: string[];
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
   * only meaningful for nodes with multiple named value outputs (today: `logic.graphEntry`,
   * one value per function parameter; and loop-container array nodes, one identifier per
   * context pin plus the overall "result") — every other case ignores it.
   */
  resultIdentifier?: (node: FlowNode, handle?: string, ctx?: EmitContext) => string;
  /** See `LoopShape`. Only set by loop-container array node types (map/filter/forEach/etc.). */
  loopShape?: LoopShape;
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
  /**
   * True if this "logic"-category node must be unconditionally top-level-collected by
   * `graph-walker.ts`'s collectLogicNodes() even though it declares an exec-entry input
   * port — the opposite of the default rule for an exec-bearing logic node (variable.set,
   * logic.graphReturn: collected only if reachable from some exec chain). Sole use case:
   * logic.handlerFunction, which needs a real exec-entry pin so express.route can wire an
   * edge into it, but — like logic.function — must stay a standalone declaration even
   * before any Route references it.
   */
  alwaysCollect?: boolean;
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
