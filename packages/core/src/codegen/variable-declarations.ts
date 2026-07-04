import type { VariableDeclaration } from "../schema/node.types.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const PARSE_FAILED = Symbol("parse-failed");

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return PARSE_FAILED;
  }
}

/**
 * Validates a variable's `name` + `defaultValue` (interpreted according to its `dataType`).
 * Returns a human-readable error message, or `null` if valid. Pure/non-throwing — shared by
 * `schema/validate.ts` (pre-flight, reported alongside every other structural error) and this
 * module's own `buildVariableDeclarationStatement` (defense-in-depth at emit time), so the two
 * can never quietly disagree about what counts as a valid variable declaration.
 *
 * An empty/absent `defaultValue` is always valid regardless of `dataType` — for `let`/`var` it
 * just means "no initializer" (`let x;`); for `const` it means "no top-level declaration at
 * all" (see `buildVariableDeclarationStatement` below), since `const x;` with no initializer
 * isn't valid JS.
 */
export function validateVariableDeclaration(variable: VariableDeclaration): string | null {
  if (!IDENTIFIER_RE.test(variable.name)) {
    return `Variable "${variable.id}" has an invalid name "${variable.name}"`;
  }

  const raw = variable.defaultValue?.trim();
  if (!raw) return null;

  switch (variable.dataType) {
    case "number":
      if (!Number.isFinite(Number(raw))) {
        return `Variable "${variable.name}" has a default value "${raw}" that isn't a valid number`;
      }
      return null;

    case "boolean":
      if (raw !== "true" && raw !== "false") {
        return `Variable "${variable.name}" has a default value "${raw}" that isn't "true" or "false"`;
      }
      return null;

    case "object": {
      const parsed = tryParseJson(raw);
      if (parsed === PARSE_FAILED) {
        return `Variable "${variable.name}" has a default value that isn't valid JSON: "${raw}"`;
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return `Variable "${variable.name}" has a default value that isn't a JSON object`;
      }
      return null;
    }

    case "array": {
      const parsed = tryParseJson(raw);
      if (parsed === PARSE_FAILED) {
        return `Variable "${variable.name}" has a default value that isn't valid JSON: "${raw}"`;
      }
      if (!Array.isArray(parsed)) {
        return `Variable "${variable.name}" has a default value that isn't a JSON array`;
      }
      return null;
    }

    case "map": {
      const parsed = tryParseJson(raw);
      if (parsed === PARSE_FAILED) {
        return `Variable "${variable.name}" has a default value that isn't valid JSON: "${raw}"`;
      }
      if (!Array.isArray(parsed)) {
        return `Variable "${variable.name}" has a default value that isn't a JSON array of [key, value] pairs`;
      }
      return null;
    }

    case "set": {
      const parsed = tryParseJson(raw);
      if (parsed === PARSE_FAILED) {
        return `Variable "${variable.name}" has a default value that isn't valid JSON: "${raw}"`;
      }
      if (!Array.isArray(parsed)) {
        return `Variable "${variable.name}" has a default value that isn't a JSON array`;
      }
      return null;
    }

    case "weakset": {
      const parsed = tryParseJson(raw);
      if (parsed === PARSE_FAILED) {
        return `Variable "${variable.name}" has a default value that isn't valid JSON: "${raw}"`;
      }
      if (!Array.isArray(parsed)) {
        return `Variable "${variable.name}" has a default value that isn't a JSON array`;
      }
      if (!parsed.every((el) => typeof el === "object" && el !== null)) {
        return `Variable "${variable.name}" has a default value with a non-object element — WeakSet can only contain objects/arrays, not primitives`;
      }
      return null;
    }

    case "bigint":
      if (!/^-?\d+$/.test(raw)) {
        return `Variable "${variable.name}" has a default value "${raw}" that isn't a valid integer (BigInt doesn't support decimals)`;
      }
      return null;

    case "url":
      try {
        // eslint-disable-next-line no-new -- validity check only, this file never touches the network
        new URL(raw);
      } catch {
        return `Variable "${variable.name}" has a default value "${raw}" that isn't a valid URL`;
      }
      return null;

    case "null":
      if (raw !== "null") {
        return `Variable "${variable.name}" is typed "null" but its default value isn't the literal "null"`;
      }
      return null;

    case "undefined":
      if (raw !== "undefined") {
        return `Variable "${variable.name}" is typed "undefined" but its default value isn't the literal "undefined"`;
      }
      return null;

    case "symbol":
    case "buffer":
    case "string":
    default:
      return null;
  }
}

/**
 * Builds the initializer literal text (the part after `=`), or `undefined` when there's no
 * default. `"string"` is JSON-stringified (so the panel's plain-text input never needs manual
 * quoting/escaping); `"object"`/`"array"` JSON text is emitted as-is (valid JSON is always
 * valid JS literal syntax); `"map"`/`"set"`/`"weakset"` wrap their JSON array text in
 * `new Map(...)`/`new Set(...)`/`new WeakSet(...)`; `"bigint"` appends the `n` suffix;
 * `"symbol"`/`"buffer"`/`"url"` wrap plain text in `Symbol(...)`/`Buffer.from(...)`/
 * `new URL(...)`; `"null"`/`"undefined"` are already-valid JS source as their own literal text
 * (validated equal to their own name by `validateVariableDeclaration` above).
 */
function buildInitializerLiteral(variable: VariableDeclaration): string | undefined {
  const raw = variable.defaultValue?.trim();
  if (!raw) return undefined;

  switch (variable.dataType) {
    case "string":
      return JSON.stringify(raw);
    case "map":
      return `new Map(${raw})`;
    case "set":
      return `new Set(${raw})`;
    case "weakset":
      return `new WeakSet(${raw})`;
    case "bigint":
      return `${raw}n`;
    case "symbol":
      return `Symbol(${JSON.stringify(raw)})`;
    case "buffer":
      return `Buffer.from(${JSON.stringify(raw)})`;
    case "url":
      return `new URL(${JSON.stringify(raw)})`;
    case "number":
    case "boolean":
    case "object":
    case "array":
    case "null":
    case "undefined":
    default:
      return raw;
  }
}

/**
 * Builds a variable's full declaration statement (e.g. `let counter = 0;`) for emission at
 * module scope (`emit-express.ts`) or function scope (`emit-function-graph.ts`) — the two
 * containers differ only in *where* this statement is textually placed, not in how it's built;
 * that placement alone is what gives "block scope unless var" for free (see
 * docs/phase10-variables-plan.md). Throws a plain `Error` if `validateVariableDeclaration`
 * rejects the variable — defense in depth, since `schema/validate.ts` is expected to have
 * already caught this before codegen ever runs.
 *
 * Returns `""` (nothing to emit) for a `const` with no default value: unlike `let`/`var`,
 * `const x;` with no initializer is a JS `SyntaxError`, so there is no valid bare declaration
 * to emit here. Instead, a `const` with no default is left undeclared at this scope entirely —
 * `variable-set.node.ts`'s `emit()` already compiles a Set node targeting a `const` as its own
 * scoped `const name = expr;` redeclaration, which becomes the *only* declaration+initialization
 * point once (and only once) that Set node is actually wired into a reachable execution chain
 * (`exec-chain.ts` never emits an unreached node — see `graph-walker.ts`'s `collectLogicNodes`).
 * A `const` left with no default and no reachable Set node simply never gets declared anywhere,
 * same "trust the user" treatment as every other dangling reference in this codebase.
 */
export function buildVariableDeclarationStatement(variable: VariableDeclaration): string {
  const error = validateVariableDeclaration(variable);
  if (error) throw new Error(error);

  const literal = buildInitializerLiteral(variable);
  if (literal === undefined && variable.keyword === "const") return "";
  return `${variable.keyword} ${variable.name}${literal !== undefined ? ` = ${literal}` : ""};`;
}
