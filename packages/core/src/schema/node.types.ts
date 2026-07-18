export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  /** React Flow `parentId` — this node is a child of the comment-group node with this id;
   * `position` is then relative to that parent's {0,0}, not absolute canvas coordinates.
   * UI-organizational only, like `position` itself — never read by codegen or validation. */
  parentId?: string;
}

/** A draggable point a wire's rendered path bends through — purely a canvas-routing aid,
 * like `FlowNode.position`: never read by codegen or validation. See Phase 31. */
export interface EdgeWaypoint {
  id: string;
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  waypoints?: EdgeWaypoint[];
}

export type VariableDataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "map"
  | "set"
  | "weakset"
  | "null"
  | "undefined"
  | "bigint"
  | "symbol"
  | "buffer"
  | "url"
  | "function"
  | "error"
  | "any";

export interface VariableDeclaration {
  id: string;
  name: string;
  keyword: "const" | "let" | "var";
  dataType: VariableDataType;
  /**
   * Raw default-value text, interpreted according to `dataType` (see
   * `codegen/variable-declarations.ts`): plain content for "string" (JSON-stringified at emit
   * time, no manual quoting needed), numeric text for "number", "true"/"false" for "boolean",
   * JSON object/array text for "object"/"array" (emitted as-is), a JSON array of `[key, value]`
   * pairs for "map" (wrapped in `new Map(...)`), a JSON array of values for "set"/"weakset"
   * (wrapped in `new Set(...)`/`new WeakSet(...)` — "weakset" additionally requires every
   * element to be an object/array literal, since `WeakSet` rejects primitives at runtime),
   * integer text for "bigint" (wrapped as `${raw}n`), a description for "symbol" (wrapped as
   * `Symbol(...)`), UTF-8 text for "buffer" (wrapped as `Buffer.from(...)`), a URL string for
   * "url" (wrapped as `new URL(...)`), a JS function expression or bare identifier reference
   * for "function" (emitted as-is, same "trust the user's raw JS" treatment as "object" — see
   * `validateVariableDeclaration`'s light "looks like a function" heuristic), or the fixed
   * literal text `"null"`/`"undefined"` for those two types. Absent/empty = no initializer,
   * regardless of `dataType`.
   */
  defaultValue?: string;
}

/** A resizable, colored, titled box drawn behind a group of nodes on the canvas — purely a
 * UI annotation, like `FlowNode.position`/`EdgeWaypoint`: never read by codegen or
 * validation. Membership (which nodes are children of this group) is persisted via
 * `FlowNode.parentId`, not computed geometrically at drag-time. */
export interface CommentGroup {
  id: string;
  title: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  color: string; // hex string, e.g. "#7d5ba6"
}

export interface Flow {
  version: string;
  meta: {
    name: string;
    target: "express" | "fastify";
  };
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: VariableDeclaration[];
  comments?: CommentGroup[];
}
