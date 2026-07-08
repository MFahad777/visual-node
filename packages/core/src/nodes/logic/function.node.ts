import type { NodeDefinition, EmitContext } from "../../schema/node-registry.js";
import type { FlowNode } from "../../schema/node.types.js";
import { emitFunctionGraphBody, FunctionGraphError, type FunctionGraph } from "../../codegen/emit-function-graph.js";
import { resolveValuePin } from "../../codegen/value-pins.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** True if `param-<index>` has a real value to use as that parameter's default — either a
 * wired incoming edge, or a non-empty `data.literals` entry — so `resolveValuePin` is only
 * called when it's guaranteed not to throw, and a parameter with no default stays bare. */
function hasParamDefault(node: FlowNode, ctx: EmitContext, pinId: string): boolean {
  if (ctx.getIncoming(node.id, pinId).length > 0) return true;
  const literal = (node.data as Record<string, any> | undefined)?.literals?.[pinId];
  return literal !== undefined && String(literal).trim() !== "";
}

/**
 * Thrown when a `mode: "blueprint"` Function node's body graph fails to compile.
 * `functionNodeId` is the outer Function node (the id `compile-project.ts` already knows how
 * to attribute a `ProjectFileError` to); `blueprintNodeId` additionally points at the specific
 * node *inside* the nested graph that caused the failure, when known.
 */
export class FunctionBodyGraphError extends Error {
  constructor(
    message: string,
    public readonly functionNodeId: string,
    public readonly blueprintNodeId?: string,
  ) {
    super(message);
  }
}

export const logicFunctionNode: NodeDefinition = {
  type: "logic.function",
  category: "logic",
  label: "Function",
  description:
    "Declares a named JavaScript function at the top level of this file. Connect it to an Export node " +
    "to make it require()-able from other blueprint files, or leave it unconnected to use it as a " +
    "private helper within this file.",
  inputs: [],
  // "out" (no explicit `kind`, legacy exec-fallback) is wired only into a `logic.export`
  // node to mark this function as module-exported — unchanged. "value" is the function's
  // own reference as a JS value (its bare name), usable to assign into a "function"-typed
  // variable or pass as a callback argument elsewhere (Phase 20).
  outputs: [
    { id: "out", label: "Function" },
    { id: "value", label: "Assign / Parameter", kind: "value" },
  ],
  configSchema: [
    {
      key: "name",
      label: "Function Name",
      type: "text",
      default: "myFunction",
      hint: "Must be a valid JS identifier. If connected to an Export node, this is also the property name other files see on the imported module.",
    },
    {
      key: "params",
      label: "Parameters",
      type: "text",
      default: "",
      hint: 'Comma-separated parameter names, e.g. "date, format". Leave blank for no parameters.',
    },
    {
      key: "body",
      label: "Function Body",
      type: "code",
      default: "",
      hint: "Available: the parameter names declared above. Use `return` to produce a value, exactly like a normal function body.",
    },
    {
      key: "mode",
      label: "Authoring Mode",
      type: "select",
      options: ["code", "blueprint"],
      default: "code",
      hint: '"code" uses the Function Body field above; "blueprint" compiles this function from a node graph instead (see the "Open Blueprint Graph" button).',
    },
    {
      key: "isAsync",
      label: "Async Function",
      type: "boolean",
      default: false,
      hint: "Enable to use await inside this function's body.",
    },
    {
      key: "npmDependencies",
      label: "npm Dependencies",
      type: "text",
      default: "",
      hint: 'Comma-separated npm packages this code requires (code mode only), e.g. "axios, lodash@^4.17.0".',
    },
  ],
  emit: (node, ctx) => {
    const name = String(node.data?.name ?? "").trim();
    if (!IDENTIFIER_RE.test(name)) {
      throw new Error(`Function node "${node.id}" has an invalid function name "${node.data?.name}"`);
    }
    const params = String(node.data?.params ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const p of params) {
      if (!IDENTIFIER_RE.test(p)) {
        throw new Error(`Function node "${node.id}" (${name}) has an invalid parameter name "${p}"`);
      }
    }
    // Each parameter gets its own dynamic `param-<i>` value-input pin (rendered on canvas via
    // `effectivePorts.ts`'s `logic.function` case) for an optional JS default value — wired
    // from another node's output or typed as a literal, exactly like `logic.functionCall`'s
    // own `param-<i>` pins, just consumed here instead of produced.
    const paramText = params.map((p, i) => {
      const pinId = `param-${i}`;
      return hasParamDefault(node, ctx, pinId) ? `${p} = ${resolveValuePin(node, ctx, pinId, {})}` : p;
    });

    const mode = node.data?.mode === "blueprint" ? "blueprint" : "code";
    let body: string;
    let imports: string[] | undefined;
    if (mode === "blueprint") {
      const graph: FunctionGraph = node.data?.graph ?? { nodes: [], edges: [] };
      try {
        const result = emitFunctionGraphBody(graph);
        body = result.code;
        imports = result.imports;
      } catch (err) {
        const inner = err instanceof FunctionGraphError ? err : new FunctionGraphError(err instanceof Error ? err.message : String(err));
        throw new FunctionBodyGraphError(`Blueprint graph error in function "${name}": ${inner.message}`, node.id, inner.nodeId);
      }
    } else {
      body = String(node.data?.body ?? "");
    }

    const isAsync = node.data?.isAsync === true;

    // Check if this function is only being inlined into SET nodes via the "value" pin.
    // If so, skip standalone emission — the SET node will inline the expression itself.
    const outgoing = ctx.getOutgoing(node.id);
    const isOnlyUsedForInlining =
      outgoing.length > 0 &&
      outgoing.every((e) => {
        if (e.sourceHandle !== "value") return false; // has "out" pin edge → not only-for-inlining
        const target = ctx.getNode(e.target);
        return target?.type === "variable.set"; // all "value" edges go to SET nodes
      });

    if (isOnlyUsedForInlining) {
      // This function is only being used inline, don't emit it standalone
      return { order: 5 };
    }

    return {
      imports: imports && imports.length > 0 ? imports : undefined,
      setup: `${isAsync ? "async " : ""}function ${name}(${paramText.join(", ")}) {\n${indent(body)}\n}`,
      order: 5,
    };
  },
  resultIdentifier: (node, handle) => {
    if (handle !== "value") {
      throw new Error(`Function node "${node.id}" produces no reusable value for output "${handle}"`);
    }
    const name = String(node.data?.name ?? "").trim();
    if (!IDENTIFIER_RE.test(name)) {
      throw new Error(`Function node "${node.id}" has an invalid function name "${node.data?.name}"`);
    }
    return name;
  },
};

function indent(code: string): string {
  return code.split("\n").map((line) => (line.length > 0 ? `  ${line}` : line)).join("\n");
}
