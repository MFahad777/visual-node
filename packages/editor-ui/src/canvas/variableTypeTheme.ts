import type { VariableDataType } from "@visual-node/core";

export interface VariableTypeTheme {
  label: string;
  /** Accent color used for pin fills, wire strokes, and the Variables panel's type swatch
   * (inline styles, not Tailwind) — mirrors `categoryTheme.ts`'s `accentHex` convention,
   * one flat hex per dataType instead of per NodeCategory. */
  color: string;
}

/**
 * Unreal-Engine-Blueprint-inspired per-dataType color, one entry per `VariableDataType`
 * (Phase 10 follow-up). Palette chosen for a dark theme, loosely inspired by Unreal's
 * variable-type color pills without a 1:1 mapping since our type list doesn't match
 * Unreal's (no Vector/Rotator/Transform/Structure/Interface/Replication equivalents here).
 * Same `Record` + typed-accessor shape as `CATEGORY_THEME`/`getCategoryTheme` in
 * `categoryTheme.ts` — follow that pattern for any future addition here.
 */
export const VARIABLE_TYPE_THEME: Record<VariableDataType, VariableTypeTheme> = {
  string: { label: "String", color: "#d6337a" },
  number: { label: "Number", color: "#3fae74" },
  boolean: { label: "Boolean", color: "#d64545" },
  object: { label: "Object", color: "#2ea3c9" },
  array: { label: "Array", color: "#c9a227" },
  map: { label: "Map", color: "#d97b29" },
  set: { label: "Set", color: "#7a9e4a" },
  weakset: { label: "WeakSet", color: "#5c7a3a" },
  null: { label: "Null", color: "#9a9a9a" },
  undefined: { label: "Undefined", color: "#6f6f6f" },
  bigint: { label: "BigInt", color: "#2f8f66" },
  symbol: { label: "Symbol", color: "#9b6fd1" },
  buffer: { label: "Buffer", color: "#a97c50" },
  url: { label: "URL", color: "#4a7fd6" },
  function: { label: "Function", color: "#e0a83c" },
};

/** All 15 dataTypes in a stable display order, for `<select>` option lists. */
export const VARIABLE_DATA_TYPES: VariableDataType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "map",
  "set",
  "weakset",
  "bigint",
  "symbol",
  "buffer",
  "url",
  "function",
  "null",
  "undefined",
];

export function getVariableTypeColor(dataType: VariableDataType): string {
  return VARIABLE_TYPE_THEME[dataType]?.color ?? "#8f8f8f";
}
