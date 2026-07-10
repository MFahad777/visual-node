import type { NodeDefinition } from "../../schema/node-registry.js";
import { sanitizeIdentifier } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";
import { resultIdentifierFor } from "../../codegen/emit-function-graph.js";

/**
 * Extracts the parent path and last segment from a dot/bracket property path.
 * E.g. `"items[0].name"` → `["items[0]", "name"]`; `"a[0].b.c"` → `["a[0].b", "c"]`.
 * The parent path is passed as a string directly to `lodash.get` (which natively
 * parses dot/bracket notation), while the last segment is manually accessed off the
 * resulting parent so the parent object stays available for `.apply()` binding.
 */
function getParentPathAndLastSegment(path: string): [parentPath: string, lastSegment: string] {
  if (path.endsWith("]")) {
    // Ends with bracket notation: extract the segment inside [...] and everything before
    const lastOpenBracket = path.lastIndexOf("[");
    const lastSegment = path.substring(lastOpenBracket + 1, path.length - 1);
    const parentPath = path.substring(0, lastOpenBracket);
    return [parentPath, lastSegment];
  } else {
    // Ends with dot notation: split at the last dot
    const lastDot = path.lastIndexOf(".");
    if (lastDot === -1) {
      // Single segment, no parent
      return ["", path];
    }
    const parentPath = path.substring(0, lastDot);
    const lastSegment = path.substring(lastDot + 1);
    return [parentPath, lastSegment];
  }
}

/**
 * Fixed-text runtime helper shared by every wired-path Path Extractor instance in the
 * generated file. Performs the identical bracket/dot split + parent-resolve +
 * apply-if-function logic the unwired branch's compile-time split does, but as a single
 * function declaration contributed once (via each node's `imports` array, deduped by exact
 * string match in `emit-express.ts`'s `Set` — the same channel the `_pathGet` require line
 * already goes through) no matter how many wired instances exist across the main canvas and
 * any number of nested Function/Handler-Function blueprint graphs. Depends on `_pathGet`
 * (`require("lodash.get")`), also contributed via `imports` — order between the two doesn't
 * matter since `require()` runs at module load and function declarations hoist regardless of
 * textual position within the deduped import block.
 */
const PATH_RESOLVE_HELPER = `function _visualNodePathResolve(obj, path, args) {
  const str = String(path);
  const isBracket = str.endsWith("]");
  let parentPath, lastSegment;
  if (isBracket) {
    const idx = str.lastIndexOf("[");
    lastSegment = str.substring(idx + 1, str.length - 1);
    parentPath = str.substring(0, idx);
  } else {
    const idx = str.lastIndexOf(".");
    if (idx === -1) {
      parentPath = "";
      lastSegment = str;
    } else {
      parentPath = str.substring(0, idx);
      lastSegment = str.substring(idx + 1);
    }
  }
  const parent = parentPath ? _pathGet(obj, parentPath) : obj;
  const value = parent?.[lastSegment];
  return typeof value === "function" ? value.apply(parent, args) : value;
}`;

/**
 * Resolves a dot/bracket property path against an input object at runtime. If the resolved
 * value is a function, it's invoked via `.apply(parent, args)` — `args` gathered from this
 * node's dynamically-added `param-<N>` value-input pins (grown/shrunk on canvas via
 * "+ Add Param"/"- Remove Param", see `packages/editor-ui/src/store/variadicPins.ts`) — so
 * `this` inside the called method is the object it was actually accessed off of, not lost the
 * way a bare `fn(...)` call would lose it. A non-function resolved value is returned as-is,
 * ignoring any params.
 */
export const pathExtractorNode: NodeDefinition = {
  type: "logic.pathExtractor",
  category: "logic",
  label: "Path Extractor",
  description:
    "Resolves a property path (dot or bracket syntax) against an object. If the resolved " +
    "value is a function, calls it with the dynamically added Param pins as arguments, " +
    "binding the correct parent object as `this`.",
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "data_object", label: "Object", kind: "value" },
    { id: "path", label: "Path", kind: "value" },
  ],
  outputs: [
    { id: "out", label: "Next", kind: "exec" },
    { id: "data_value", label: "Value", kind: "value" },
  ],
  configSchema: [{ key: "path", label: "Path", type: "text", default: "" }],
  npmDependencies: { "lodash.get": "^4.4.2" },
  emit: (node, ctx) => {
    const objectExpr = resolveValuePin(node, ctx, "data_object", { defaultLiteral: "undefined" });
    const paramCount = Math.max(0, Number(node.data?.paramCount ?? 0));
    const argExprs = Array.from({ length: paramCount }, (_, i) =>
      resolveValuePin(node, ctx, `param-${i}`, { defaultLiteral: "undefined" }),
    );

    // Every temp binding is suffixed with this node's own sanitized id (matching `resultVar`'s
    // own convention) so it can never collide with `objectExpr`/`argExprs` text — those come
    // from `resolveValuePin`, which may echo back an arbitrary wired identifier or raw literal
    // a user typed, and a plain `__obj`-style name would self-shadow if that text ever matched.
    const suffix = sanitizeIdentifier(node.id);
    const resultVar = `_pathval_${suffix}`;
    const objVar = `_pathobj_${suffix}`;
    const argsVar = `_pathargs_${suffix}`;
    const parentVar = `_pathparent_${suffix}`;
    const valueVar = `_pathvalue_${suffix}`;

    // Check if the path is wired or literal
    const incomingPath = ctx.getIncoming(node.id, "path");
    if (incomingPath.length > 1) {
      throw new Error(`Node "${node.id}" input "path" has more than one incoming connection`);
    }

    if (incomingPath[0]) {
      // Wired path branch: split path at runtime via the shared _visualNodePathResolve
      // helper (contributed once per generated file via `imports`, deduped the same way
      // `_pathGet`'s require() line already dedups today).
      const source = ctx.getNode(incomingPath[0].source);
      if (!source) {
        throw new Error(`Node "${node.id}" input "path" references unknown node "${incomingPath[0].source}"`);
      }
      const pathExpr = resultIdentifierFor(source, incomingPath[0].sourceHandle, ctx);

      const body = `const ${resultVar} = _visualNodePathResolve(${objectExpr}, ${pathExpr}, [${argExprs.join(", ")}]);`;

      return {
        body,
        order: 0,
        imports: ['const _pathGet = require("lodash.get");', PATH_RESOLVE_HELPER],
      };
    } else {
      // Unwired path branch: use literal from node.data.path (existing behavior)
      const path = String(node.data?.path ?? "").trim();
      if (!path) {
        throw new Error(`Path Extractor node "${node.id}" has an empty path`);
      }

      const [parentPath, lastSegment] = getParentPathAndLastSegment(path);

      // Determine if lodash is needed: only for parent paths with dots or brackets (multi-segment).
      // Single-segment paths or empty parent (single-segment full path) use direct optional chaining
      // instead. lodash.get handles both dot and bracket notation natively in strings.
      const needsLodash = parentPath && (parentPath.includes(".") || parentPath.includes("["));
      const parentExpr = needsLodash
        ? `_pathGet(${objVar}, ${JSON.stringify(parentPath)})`
        : parentPath
          ? `${objVar}?.[${JSON.stringify(parentPath)}]`
          : objVar;

      const body = `const ${resultVar} = (() => {
  const ${objVar} = ${objectExpr};
  const ${argsVar} = [${argExprs.join(", ")}];
  const ${parentVar} = ${parentExpr};
  const ${valueVar} = ${parentVar}?.[${JSON.stringify(lastSegment)}];
  return typeof ${valueVar} === "function" ? ${valueVar}.apply(${parentVar}, ${argsVar}) : ${valueVar};
})();`;

      return { body, order: 0, imports: needsLodash ? ['const _pathGet = require("lodash.get");'] : [] };
    }
  },
  resultIdentifier: (node) => `_pathval_${sanitizeIdentifier(node.id)}`,
};
