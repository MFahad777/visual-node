export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
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
  | "function";

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

export interface Flow {
  version: string;
  meta: {
    name: string;
    target: "express" | "fastify";
  };
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: VariableDeclaration[];
}
