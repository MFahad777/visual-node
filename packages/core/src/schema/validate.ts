import type { Flow, FlowEdge, FlowNode, VariableDeclaration } from "./node.types.js";
import { getNodeDefinition, requireNodeDefinition, type LoopShape, type NodeDefinition } from "./node-registry.js";
import { CycleError, topologicalSort } from "../codegen/topo-sort.js";
import { execEntryPort, getForkArmPinIds } from "../codegen/exec-chain.js";
import { validateVariableDeclaration } from "../codegen/variable-declarations.js";

export interface ValidationError {
  nodeId?: string;
  /** Set when the error originates inside a Function node's blueprint body graph, pointing at the specific node within it. */
  blueprintNodeId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Structural validation of a flow graph, independent of any target (Express/Fastify).
 * Codegen must refuse to run against an invalid flow — silently emitting broken code
 * is worse than refusing outright.
 */
export function validateFlow(flow: Flow): ValidationResult {
  const errors: ValidationError[] = [];
  const nodesById = new Map<string, FlowNode>(flow.nodes.map((n) => [n.id, n]));

  for (const edge of flow.edges) {
    if (!nodesById.has(edge.source)) {
      errors.push({ nodeId: edge.source, message: `Edge "${edge.id}" references unknown source node "${edge.source}"` });
    }
    if (!nodesById.has(edge.target)) {
      errors.push({ nodeId: edge.target, message: `Edge "${edge.id}" references unknown target node "${edge.target}"` });
    }
  }

  for (const node of flow.nodes) {
    if (!getNodeDefinition(node.type)) {
      errors.push({ nodeId: node.id, message: `Unknown node type "${node.type}"` });
    }
  }
  if (errors.length > 0) {
    // Can't reason about routing/cycles once a node type is unrecognized.
    return { valid: false, errors };
  }

  const STRUCTURAL_CATEGORIES = new Set(["server", "routing", "middleware"]);
  const usesAppChain = flow.nodes.some((n) => STRUCTURAL_CATEGORIES.has(requireNodeDefinition(n.type).category));
  const initNodes = flow.nodes.filter((n) => n.type === "express.init");
  if (usesAppChain && initNodes.length === 0) {
    errors.push({ message: 'Flow must contain exactly one "express.init" node (found 0)' });
  } else if (initNodes.length > 1) {
    for (const n of initNodes) {
      errors.push({ nodeId: n.id, message: 'Only one "express.init" node is allowed per flow' });
    }
  }

  const beginNodes = flow.nodes.filter((n) => n.type === "logic.begin");
  if (beginNodes.length > 1) {
    for (const n of beginNodes) {
      errors.push({ nodeId: n.id, message: 'Only one "logic.begin" node is allowed per flow' });
    }
  }

  const exportNodes = flow.nodes.filter((n) => n.type === "logic.export");
  if (exportNodes.length > 1) {
    for (const n of exportNodes) {
      errors.push({ nodeId: n.id, message: 'Only one "logic.export" node is allowed per flow' });
    }
  }
  const exportVariablesById = new Map((flow.variables ?? []).map((v) => [v.id, v]));
  for (const exp of exportNodes) {
    const seenVariableIds = new Set<string>();
    const seenFunctionSourceIds = new Set<string>();
    for (const edge of flow.edges.filter((e) => e.target === exp.id)) {
      const source = nodesById.get(edge.source);
      if (!source) continue;
      if (edge.targetHandle === "variables") {
        if (source.type !== "variable.get") {
          errors.push({
            nodeId: exp.id,
            message: `Export node's "Variables" input can only be connected to Get Variable nodes, got "${source.type}"`,
          });
          continue;
        }
        const variableId = (source.data as Record<string, unknown> | undefined)?.variableId;
        const variable = typeof variableId === "string" ? exportVariablesById.get(variableId) : undefined;
        if (typeof variableId === "string") {
          if (seenVariableIds.has(variableId)) {
            errors.push({
              nodeId: exp.id,
              message: `Export node cannot export variable "${variable?.name ?? variableId}" more than once — remove the duplicate connection.`,
            });
          }
          seenVariableIds.add(variableId);
        }
        if (variable && variable.keyword === "const" && !(variable.defaultValue?.trim().length ?? 0) && variable.dataType !== "function") {
          errors.push({
            nodeId: exp.id,
            message:
              `Cannot export variable "${variable.name}": it is declared "const" with no default value, so it has ` +
              `no guaranteed top-level declaration in the generated file. Give it a default value, or change it to "let"/"var".`,
          });
        }
      } else if (source.type !== "logic.function") {
        errors.push({ nodeId: exp.id, message: `Export node can only be connected to Function nodes, got "${source.type}"` });
      } else {
        if (seenFunctionSourceIds.has(source.id)) {
          errors.push({
            nodeId: exp.id,
            message: `Export node cannot export function "${String(source.data?.name ?? source.id)}" more than once — remove the duplicate connection.`,
          });
        }
        seenFunctionSourceIds.add(source.id);
      }
    }
  }

  const bindingNames = new Map<string, string[]>();
  for (const n of flow.nodes) {
    const name =
      n.type === "logic.function" ? String(n.data?.name ?? "").trim() :
      n.type === "logic.require" ? String(n.data?.variableName ?? "").trim() :
      n.type === "logic.functionCall" ? String(n.data?.resultVariable ?? "").trim() : undefined;
    if (!name) continue;
    bindingNames.set(name, [...(bindingNames.get(name) ?? []), n.id]);
  }
  for (const [name, ids] of bindingNames) {
    if (ids.length > 1) {
      for (const id of ids) {
        errors.push({ nodeId: id, message: `Top-level name "${name}" is declared more than once in this file` });
      }
    }
  }

  const requireVariableNames = new Set(
    flow.nodes.filter((n) => n.type === "logic.require").map((n) => String(n.data?.variableName ?? "").trim()),
  );
  const functionCallNodes = flow.nodes.filter((n) => n.type === "logic.functionCall");
  for (const call of functionCallNodes) {
    const variableName = String(call.data?.variableName ?? "").trim();
    if (!requireVariableNames.has(variableName)) {
      errors.push({
        nodeId: call.id,
        message: `Function Call node references variable "${variableName}", but no Require node in this file defines it`,
      });
    }

    const params = String(call.data?.params ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    params.forEach((_, i) => {
      const incoming = flow.edges.filter((e) => e.target === call.id && e.targetHandle === `param-${i}`);
      if (incoming.length > 1) {
        errors.push({ nodeId: call.id, message: `Function Call node's parameter ${i} has more than one incoming connection` });
        return;
      }
      const edge = incoming[0];
      if (!edge) return;
      const source = nodesById.get(edge.source);
      if (source && source.type !== "logic.functionCall") {
        errors.push({
          nodeId: call.id,
          message: `Function Call node's parameter ${i} can only be connected to another Function Call node, got "${source.type}"`,
        });
      }
    });
  }

  const routeNodes = flow.nodes.filter((n) => n.type === "express.route");
  for (const route of routeNodes) {
    const outgoing = flow.edges.filter((e) => e.source === route.id);
    if (outgoing.length === 0) {
      errors.push({ nodeId: route.id, message: `Route "${route.data?.method ?? "?"} ${route.data?.path ?? "?"}" has no handler attached` });
      continue;
    }
    if (outgoing.length > 1) {
      errors.push({ nodeId: route.id, message: "Route has more than one outgoing connection; only a single handler chain is supported" });
    }
    const target = nodesById.get(outgoing[0].target);
    if (target) {
      const targetDef = requireNodeDefinition(target.type);
      // Whether a node can be the first node in a Route's handler chain is a question about
      // its declared ports (does it have an exec-entry pin?), not its category — a category
      // allow-list here would need updating for every new category (as it did for Phase 7's
      // "controlFlow", and would again for a Phase 9 plugin node declaring any of the 8
      // categories). `execEntryPort` is the same check `exec-chain.ts` uses to walk the
      // chain itself, so this can never disagree with what actually gets emitted.
      if (!execEntryPort(targetDef)) {
        errors.push({ nodeId: route.id, message: `Route must connect to a handler node, got "${target.type}"` });
      }
    }
  }

  errors.push(...validateOperatorsAndControlFlow(flow.nodes, flow.edges, (nodeId, message) => ({ nodeId, message })));
  errors.push(...checkCrossArmValueReferences(flow.nodes, flow.edges, (nodeId, message) => ({ nodeId, message })));
  errors.push(...validateExecOutputArity(flow.nodes, flow.edges, (nodeId, message) => ({ nodeId, message })));
  errors.push(...validateVariables(flow.nodes, flow.variables ?? [], (nodeId, message) => ({ nodeId, message })));

  const cycleError = detectCycle(flow);
  if (cycleError) errors.push(cycleError);

  for (const fn of flow.nodes.filter((n) => n.type === "logic.function" && n.data?.mode === "blueprint")) {
    errors.push(...validateFunctionGraph(flow, fn));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a `mode: "blueprint"` Function node's nested body graph. Mirrors the shape of
 * several top-level checks above (Return arity, Function Call's Require binding, cycles) but
 * scoped to `functionNode.data.graph` instead of `flow.nodes` — that graph is never part of
 * `flow.nodes` itself, so none of the checks above ever see it.
 */
function validateFunctionGraph(flow: Flow, functionNode: FlowNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const graph =
    (functionNode.data?.graph as { nodes?: FlowNode[]; edges?: FlowEdge[]; variables?: VariableDeclaration[] } | undefined) ??
    {};
  const graphNodes = graph.nodes ?? [];
  const graphEdges = graph.edges ?? [];
  const graphVariables = graph.variables ?? [];
  const functionName = String(functionNode.data?.name ?? functionNode.id);

  for (const n of graphNodes) {
    if (!getNodeDefinition(n.type)) {
      errors.push({ nodeId: functionNode.id, blueprintNodeId: n.id, message: `Function "${functionName}" blueprint graph references unknown node type "${n.type}"` });
    }
  }
  if (errors.length > 0) return errors;

  const nodesById = new Map(graphNodes.map((n) => [n.id, n]));
  for (const edge of graphEdges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      errors.push({ nodeId: functionNode.id, message: `Function "${functionName}" blueprint graph has an edge referencing a missing node` });
    }
  }

  const paramNames = new Set(
    String(functionNode.data?.params ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
  );
  const entryNodes = graphNodes.filter((n) => n.type === "logic.graphEntry");
  if (entryNodes.length > 1) {
    for (const n of entryNodes) {
      errors.push({
        nodeId: functionNode.id,
        blueprintNodeId: n.id,
        message: `Function "${functionName}" blueprint graph can have at most one Start node`,
      });
    }
  }
  for (const n of entryNodes) {
    for (const edge of graphEdges.filter((e) => e.source === n.id)) {
      const handle = edge.sourceHandle ?? "";
      if (handle === "out") continue;
      if (!paramNames.has(handle)) {
        errors.push({
          nodeId: functionNode.id,
          blueprintNodeId: n.id,
          message: `Function "${functionName}" blueprint graph references undeclared parameter "${handle}"`,
        });
      }
    }
  }

  const requireVariableNames = new Set(flow.nodes.filter((n) => n.type === "logic.require").map((n) => String(n.data?.variableName ?? "").trim()));
  // Includes the function whose graph is currently being validated (it's a `logic.function`
  // node in `flow.nodes` like any other) — so a recursive self-call validates for free with
  // no extra special-casing.
  const sameFileFunctionNames = new Set(
    flow.nodes.filter((n) => n.type === "logic.function").map((n) => String(n.data?.name ?? "").trim()),
  );
  const resultVarOwners = new Map<string, string[]>();
  for (const call of graphNodes.filter((n) => n.type === "logic.functionCall")) {
    const callKind = call.data?.callKind === "sameFile" ? "sameFile" : "require";
    if (callKind === "sameFile") {
      const calledFunctionName = String(call.data?.functionName ?? "").trim();
      if (!sameFileFunctionNames.has(calledFunctionName)) {
        errors.push({
          nodeId: functionNode.id,
          blueprintNodeId: call.id,
          message: `Function "${functionName}" blueprint graph's Function Call node calls "${calledFunctionName}", but no Function node with that name exists in this file`,
        });
      }
    } else {
      const variableName = String(call.data?.variableName ?? "").trim();
      if (!requireVariableNames.has(variableName)) {
        errors.push({
          nodeId: functionNode.id,
          blueprintNodeId: call.id,
          message: `Function "${functionName}" blueprint graph's Function Call node references variable "${variableName}", but no Require node in this file defines it`,
        });
      }
    }
    // Validate that all declared parameters are wired to a value source
    // Parameter pins are indexed as "param-0", "param-1", etc., not by their names
    const paramNames = String(call.data?.params ?? "").split(",").map((p) => p.trim()).filter((p) => p.length > 0);
    for (let i = 0; i < paramNames.length; i++) {
      const hasWiredInput = graphEdges.some((e) => e.target === call.id && e.targetHandle === `param-${i}`);
      if (!hasWiredInput) {
        errors.push({
          nodeId: functionNode.id,
          blueprintNodeId: call.id,
          message: `Function "${functionName}" blueprint graph's Function Call node's parameter "${paramNames[i]}" is not wired to a value`,
        });
      }
    }
    const resultVariable = String(call.data?.resultVariable ?? "").trim();
    if (resultVariable) resultVarOwners.set(resultVariable, [...(resultVarOwners.get(resultVariable) ?? []), call.id]);
  }
  // A Function Call's resultVariable becomes a `const` declaration in the compiled function
  // body — it must not collide with the function's own parameters or with another Function
  // Call's resultVariable in the same graph, either of which would emit a duplicate-declaration
  // SyntaxError.
  for (const [name, ids] of resultVarOwners) {
    if (paramNames.has(name) || ids.length > 1) {
      for (const id of ids) {
        errors.push({
          nodeId: functionNode.id,
          blueprintNodeId: id,
          message: paramNames.has(name)
            ? `Function "${functionName}" blueprint graph's Function Call result variable "${name}" collides with a parameter of the same name`
            : `Function "${functionName}" blueprint graph has more than one Function Call node using result variable "${name}"`,
        });
      }
    }
  }

  const emittableIds = graphNodes.map((n) => n.id);
  try {
    topologicalSort(emittableIds, graphEdges);
  } catch (err) {
    if (err instanceof CycleError) {
      errors.push({ nodeId: functionNode.id, message: `Function "${functionName}" blueprint graph contains a cycle` });
    } else {
      throw err;
    }
  }

  // Phase 7: operator pin arity + Branch/Switch structural checks, scoped to this graph the
  // same way every other check in this function is — mirrors the top-level calls in
  // validateFlow() above, following the existing Expression/FunctionCall parallel-checks
  // pattern (same checks, same helper, different attribution).
  const attribute = (nodeId: string, message: string): ValidationError => ({
    nodeId: functionNode.id,
    blueprintNodeId: nodeId,
    message: `Function "${functionName}" blueprint graph: ${message}`,
  });
  errors.push(...validateOperatorsAndControlFlow(graphNodes, graphEdges, attribute));
  errors.push(...checkCrossArmValueReferences(graphNodes, graphEdges, attribute));
  errors.push(...validateExecOutputArity(graphNodes, graphEdges, attribute));
  // Phase 10: this function's own variables are a completely independent namespace from the
  // main canvas's `flow.variables` (see `validateVariables`'s doc comment) — never
  // cross-checked against `flow.variables` here.
  errors.push(...validateVariables(graphNodes, graphVariables, attribute));

  return errors;
}

/**
 * Phase 10 checks for a `VariableDeclaration[]` list, shared by both `validateFlow` (scoped to
 * top-level `flow.variables`) and `validateFunctionGraph` (scoped to a single Function's own
 * `graph.variables`) — same "same checks, different attribution" pattern already used for
 * `validateOperatorsAndControlFlow` etc. The two scopes are completely independent namespaces:
 * a top-level variable and a same-named function-scoped variable never collide, and this
 * function is never called with both lists combined.
 *
 * 1. Every variable's `name` must be a valid JS identifier, and its `defaultValue` (if any)
 *    must be well-formed for its declared `dataType` (`codegen/variable-declarations.ts`'s
 *    `validateVariableDeclaration` — shared with codegen's own defense-in-depth check, so the
 *    two can never disagree about what counts as valid).
 * 2. No two variables in the same list may share a `name` (would emit a duplicate-declaration
 *    SyntaxError).
 * 3. Every `variable.get`/`variable.set` node's `data.variableId` must resolve to a real entry
 *    in this scope's variable list — catches a variable deleted out from under a still-wired
 *    node, consistent with this codebase's "refuse to compile rather than silently emit broken
 *    code" philosophy.
 *
 * Deliberately NOT checked here: a `variable.set` node targeting a `keyword: "const"`
 * variable. That used to be a hard block, but it broke the moment a variable's keyword
 * could be flipped to `const` after a Set node already existed (via the Variables panel),
 * surfacing as a confusing, un-actionable Problems-panel error. `variable-set.node.ts`'s
 * `emit()` instead compiles a Set-on-const as its own scoped `const` redeclaration rather
 * than a bare assignment — valid JS (block-scoped shadowing, not a mutation) in the
 * common case, so there is nothing to block here.
 */
function validateVariables(
  nodes: FlowNode[],
  variables: VariableDeclaration[],
  makeError: (nodeId: string, message: string) => ValidationError,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const namesSeen = new Map<string, string[]>();
  for (const v of variables) {
    const error = validateVariableDeclaration(v);
    if (error) errors.push(makeError(v.id, error));
    namesSeen.set(v.name, [...(namesSeen.get(v.name) ?? []), v.id]);
  }
  for (const [name, ids] of namesSeen) {
    if (ids.length > 1) {
      for (const id of ids) {
        errors.push(makeError(id, `Variable name "${name}" is declared more than once`));
      }
    }
  }

  const variablesById = new Map(variables.map((v) => [v.id, v]));
  for (const node of nodes) {
    if (node.type !== "variable.get" && node.type !== "variable.set") continue;
    const variableId = (node.data as Record<string, unknown> | undefined)?.variableId;
    const variable = typeof variableId === "string" ? variablesById.get(variableId) : undefined;
    const label = node.type === "variable.get" ? "Get Variable" : "Set Variable";
    if (!variable) {
      errors.push(makeError(node.id, `${label} node "${node.id}" references unknown variable "${String(variableId)}"`));
      continue;
    }
  }

  return errors;
}

/**
 * Phase 7 structural checks shared by both `validateFlow` (top-level flow) and
 * `validateFunctionGraph` (a Function node's nested blueprint body graph) — same pattern as
 * the pre-existing Expression/FunctionCall checks, which also run at both scopes:
 *
 * 1. Operator pin arity: every node whose registered category is `"operators"` (looked up via
 *    `requireNodeDefinition`, never a hardcoded list of the 17 operator type strings) must have
 *    at most one incoming edge per value input pin (`def.inputs` ids, plus — only for the 5
 *    variadic boolean types, detected generically by the presence of an array
 *    `node.data.extraInputs` rather than by type string — each id declared there); an unwired
 *    pin must have a non-empty `node.data.literals[pinId]` fallback, matching
 *    `codegen/value-pins.ts`'s `resolveValuePin` emptiness rule exactly (`undefined` or an
 *    all-whitespace string counts as "no literal"). `extraInputs` itself may not contain the
 *    reserved names "a"/"b" or a duplicate entry.
 * 2. Branch structural checks: "condition" has the same at-most-one-edge/literal-fallback rule;
 *    at least one of "true"/"false" must have an outgoing edge (a totally unwired Branch does
 *    nothing and is almost certainly a mistake).
 * 3. Switch structural checks: `node.data.cases` must be an array of `{id, value}` entries —
 *    `id` a non-empty string, `value` a finite string/number/boolean (user-provided, any type,
 *    not limited to integers) — with no duplicate `id`s and no duplicate `value`s (deduped by
 *    type+value together, since `switch`'s `===` treats `"1"` and `1` as distinct cases); every
 *    outgoing edge's `sourceHandle` must resolve to "default" or `case-<id>` for an id still
 *    present in `cases` (catches a stale edge left over after a case was removed on canvas); at
 *    least one case's or "default"'s outgoing edge must exist; "selection" has the same
 *    at-most-one-edge/literal-fallback rule as Branch's "condition" (and, unlike Branch's
 *    boolean-typed condition, may hold any type of literal or wired value).
 */
function validateOperatorsAndControlFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  makeError: (nodeId: string, message: string) => ValidationError,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Mirrors codegen/value-pins.ts's resolveValuePin: `undefined` or an all-whitespace string
  // is "no literal" (not just a literal `undefined`), so the two can never quietly disagree
  // about whether a given unwired pin is actually usable.
  const hasLiteral = (node: FlowNode, pinId: string): boolean => {
    const literals = (node.data as Record<string, unknown> | undefined)?.literals as Record<string, unknown> | undefined;
    const value = literals?.[pinId];
    return value !== undefined && String(value).trim() !== "";
  };

  for (const node of nodes) {
    const def = requireNodeDefinition(node.type);

    if (def.category === "operators") {
      const extraInputs = Array.isArray((node.data as Record<string, unknown> | undefined)?.extraInputs)
        ? ((node.data as Record<string, unknown>).extraInputs as unknown[]).map((v) => String(v))
        : undefined;

      if (extraInputs) {
        const seen = new Set<string>();
        for (const name of extraInputs) {
          if (name === "a" || name === "b") {
            errors.push(makeError(node.id, `${def.label} node "${node.id}" declares an extra input named "${name}", which collides with its built-in "a"/"b" pins`));
          } else if (seen.has(name)) {
            errors.push(makeError(node.id, `${def.label} node "${node.id}" declares the extra input "${name}" more than once`));
          }
          seen.add(name);
        }
      }

      const pinIds = [...def.inputs.map((p) => p.id), ...(extraInputs ?? [])];
      for (const pinId of pinIds) {
        const incoming = edges.filter((e) => e.target === node.id && e.targetHandle === pinId);
        if (incoming.length > 1) {
          errors.push(makeError(node.id, `${def.label} node "${node.id}" input "${pinId}" has more than one incoming connection`));
        } else if (incoming.length === 0 && !hasLiteral(node, pinId)) {
          errors.push(makeError(node.id, `${def.label} node "${node.id}" input "${pinId}" is not connected and has no literal value`));
        }
      }
    }

    if (node.type === "controlFlow.branch") {
      const conditionIncoming = edges.filter((e) => e.target === node.id && e.targetHandle === "condition");
      if (conditionIncoming.length > 1) {
        errors.push(makeError(node.id, `Branch node "${node.id}" input "condition" has more than one incoming connection`));
      } else if (conditionIncoming.length === 0 && !hasLiteral(node, "condition")) {
        errors.push(makeError(node.id, `Branch node "${node.id}" input "condition" is not connected and has no literal value`));
      }

      const trueWired = edges.some((e) => e.source === node.id && e.sourceHandle === "true");
      const falseWired = edges.some((e) => e.source === node.id && e.sourceHandle === "false");
      if (!trueWired && !falseWired) {
        errors.push(makeError(node.id, `Branch node "${node.id}" has no outgoing connection on either "True" or "False" — it would do nothing`));
      }
    }

    if (node.type === "controlFlow.switch") {
      const rawCases = (node.data as Record<string, unknown> | undefined)?.cases;
      const casesArray = Array.isArray(rawCases) ? (rawCases as unknown[]) : undefined;
      const validCases: Array<{ id: string; value: string | number | boolean }> = [];
      if (!casesArray) {
        errors.push(makeError(node.id, `Switch node "${node.id}" has an invalid "cases" list (must be an array)`));
      } else {
        const seenIds = new Set<string>();
        // Dedup key incorporates the JS type, not just the value, since a switch's `===`
        // comparison treats the string "1" and the number 1 as distinct cases.
        const seenValues = new Set<string>();
        for (const entry of casesArray) {
          const c = entry as { id?: unknown; value?: unknown } | undefined;
          const id = typeof c?.id === "string" ? c.id : undefined;
          const value = c?.value;
          const isPrimitive = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
          if (!id || !isPrimitive || (typeof value === "number" && !Number.isFinite(value))) {
            errors.push(makeError(node.id, `Switch node "${node.id}" has an invalid case entry (needs a string "id" and a string/number/boolean "value")`));
            continue;
          }
          if (seenIds.has(id)) {
            errors.push(makeError(node.id, `Switch node "${node.id}" has duplicate case id "${id}"`));
            continue;
          }
          seenIds.add(id);
          const valueKey = `${typeof value}:${value}`;
          if (seenValues.has(valueKey)) {
            errors.push(makeError(node.id, `Switch node "${node.id}" has duplicate case value ${JSON.stringify(value)}`));
          }
          seenValues.add(valueKey);
          validCases.push({ id, value });
        }
      }

      const validHandles = new Set<string>(["default", ...validCases.map((c) => `case-${c.id}`)]);
      const outgoing = edges.filter((e) => e.source === node.id);
      for (const e of outgoing) {
        if (!validHandles.has(e.sourceHandle ?? "")) {
          errors.push(makeError(node.id, `Switch node "${node.id}" has an outgoing connection ("${e.sourceHandle ?? ""}") that references a case that no longer exists`));
        }
      }
      if (!outgoing.some((e) => validHandles.has(e.sourceHandle ?? ""))) {
        errors.push(makeError(node.id, `Switch node "${node.id}" has no outgoing connections on any case or "Default" — it would do nothing`));
      }

      const selectionIncoming = edges.filter((e) => e.target === node.id && e.targetHandle === "selection");
      if (selectionIncoming.length > 1) {
        errors.push(makeError(node.id, `Switch node "${node.id}" input "selection" has more than one incoming connection`));
      } else if (selectionIncoming.length === 0 && !hasLiteral(node, "selection")) {
        errors.push(makeError(node.id, `Switch node "${node.id}" input "selection" is not connected and has no literal value`));
      }
    }

    if (node.type === "controlFlow.sequence") {
      const rawPins = (node.data as Record<string, unknown> | undefined)?.pins;
      const pinsArray = rawPins === undefined ? [] : Array.isArray(rawPins) ? (rawPins as unknown[]) : undefined;
      const validPins: string[] = [];
      if (!pinsArray) {
        errors.push(makeError(node.id, `Sequence node "${node.id}" has an invalid "pins" list (must be an array)`));
      } else {
        const seenIds = new Set<string>();
        for (const entry of pinsArray) {
          const p = entry as { id?: unknown } | undefined;
          const id = typeof p?.id === "string" ? p.id : undefined;
          if (!id) {
            errors.push(makeError(node.id, `Sequence node "${node.id}" has an invalid pin entry (needs a string "id")`));
            continue;
          }
          if (seenIds.has(id)) {
            errors.push(makeError(node.id, `Sequence node "${node.id}" has duplicate pin id "${id}"`));
            continue;
          }
          seenIds.add(id);
          validPins.push(id);
        }
      }

      const validHandles = new Set<string>(["then-0", ...validPins.map((id) => `then-${id}`)]);
      const outgoing = edges.filter((e) => e.source === node.id);
      for (const e of outgoing) {
        if (!validHandles.has(e.sourceHandle ?? "")) {
          errors.push(makeError(node.id, `Sequence node "${node.id}" has an outgoing connection ("${e.sourceHandle ?? ""}") that references a pin that no longer exists`));
        }
      }
      if (!outgoing.some((e) => validHandles.has(e.sourceHandle ?? ""))) {
        errors.push(makeError(node.id, `Sequence node "${node.id}" has no outgoing connections on any "Then" pin — it would do nothing`));
      }
    }

    // Phase 20: Callback's dynamic `arg-<id>` pins mirror Sequence's `data.pins` shape check
    // above, but on the INPUT side — a stable-id array of value-input pins, not exec-output
    // pins, so it's incoming edges (not outgoing) that must reference a still-present id.
    if (node.type === "logic.callback") {
      const rawArgs = (node.data as Record<string, unknown> | undefined)?.args;
      const argsArray = rawArgs === undefined ? [] : Array.isArray(rawArgs) ? (rawArgs as unknown[]) : undefined;
      const validArgs: string[] = [];
      if (!argsArray) {
        errors.push(makeError(node.id, `Callback node "${node.id}" has an invalid "args" list (must be an array)`));
      } else {
        const seenIds = new Set<string>();
        for (const entry of argsArray) {
          const a = entry as { id?: unknown } | undefined;
          const id = typeof a?.id === "string" ? a.id : undefined;
          if (!id) {
            errors.push(makeError(node.id, `Callback node "${node.id}" has an invalid arg entry (needs a string "id")`));
            continue;
          }
          if (seenIds.has(id)) {
            errors.push(makeError(node.id, `Callback node "${node.id}" has duplicate arg id "${id}"`));
            continue;
          }
          seenIds.add(id);
          validArgs.push(id);
        }
      }

      const validHandles = new Set<string>(["in", "function", ...validArgs.map((id) => `arg-${id}`)]);
      const incoming = edges.filter((e) => e.target === node.id);
      for (const e of incoming) {
        if (!validHandles.has(e.targetHandle ?? "")) {
          errors.push(makeError(node.id, `Callback node "${node.id}" has an incoming connection ("${e.targetHandle ?? ""}") that references a pin that no longer exists`));
        }
      }
    }

    // Phase 12: Return's "value" pin follows the same arity/literal-fallback rule as Branch's
    // "condition"/Switch's "selection" above. Deliberately no check on the "in" (exec) pin
    // here: an unwired "in" is legal — `emit-function-graph.ts` treats it as the backward-
    // compat fallback (append as a trailing trunk-level return), not an error.
    if (node.type === "logic.graphReturn") {
      const valueIncoming = edges.filter((e) => e.target === node.id && e.targetHandle === "value");
      if (valueIncoming.length > 1) {
        errors.push(makeError(node.id, `Return node "${node.id}" input "value" has more than one incoming connection`));
      } else if (valueIncoming.length === 0 && !hasLiteral(node, "value")) {
        errors.push(makeError(node.id, `Return node "${node.id}" input "value" is not connected and has no literal value`));
      }
    }
  }

  return errors;
}

/**
 * Every execution-output pin — a node's plain "out", or a fork node's "true"/"false"/
 * "case-<id>"/"default" — may have AT MOST ONE outgoing wire, but ONLY for nodes that
 * actually participate in a linear/forking exec-chain walk (a Route's handler chain or a
 * Function Graph's body, both compiled by `codegen/exec-chain.ts`, which only ever follows
 * the first edge it finds off a given exec-out handle — `ctx.getOutgoing(id, pinId)[0]`). A
 * second wire from the same exec pin there isn't an alternate path, it's silently dead: the
 * canvas happily renders both wires and the second one just never fires. Found via a real
 * report: wiring a Branch's "False" output to two different nodes drew both wires with no
 * error, but only one ever actually ran.
 *
 * This does NOT apply to the top-level structural graph (`STRUCTURAL_CATEGORIES`:
 * server/routing/middleware) — that's walked by `graph-walker.ts`'s general topological
 * sort, not `exec-chain.ts`, and one node fanning out to several dependents there is normal
 * and correct (e.g. `express.init`'s "out" legitimately feeds both a middleware chain AND
 * `express.listen`). `express.route` (category "routing") is excluded by that same category
 * filter and keeps its own, more specific "more than one outgoing connection" check above.
 */
function validateExecOutputArity(
  nodes: FlowNode[],
  edges: FlowEdge[],
  makeError: (nodeId: string, message: string) => ValidationError,
): ValidationError[] {
  const STRUCTURAL_CATEGORIES = new Set(["server", "routing", "middleware"]);
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    const def = requireNodeDefinition(node.type);
    if (STRUCTURAL_CATEGORIES.has(def.category)) continue;
    const forkPins = getForkArmPinIds(node);
    // A loop node has TWO exec-output pins (bodyPin, completedPin) — `execOutputHandle`
    // would only ever find the first-declared one, leaving the other unchecked.
    const loopPins = def.loopShape ? [def.loopShape.bodyPin, def.loopShape.completedPin] : undefined;
    const singleOutHandle = forkPins || loopPins ? undefined : execOutputHandle(def);
    const execPinIds = forkPins ?? loopPins ?? (singleOutHandle !== undefined ? [singleOutHandle] : []);

    for (const pinId of execPinIds) {
      const matching = edges.filter(
        (e) =>
          e.source === node.id &&
          (e.sourceHandle === pinId || (e.sourceHandle === undefined && !forkPins && def.outputs.length === 1)),
      );
      if (matching.length > 1) {
        errors.push(
          makeError(
            node.id,
            `Node "${node.id}" has more than one outgoing connection from its "${pinId}" execution output — only the first one wired would ever run`,
          ),
        );
      }
    }
  }

  return errors;
}

/** True when `handle` identifies `def`'s single execution-input pin: `kind: "exec"`, or (for
 * pre-Phase-7 node types that never set `kind`) the legacy `id === "in"` naming convention.
 * Deliberately duplicated from (rather than imported out of) `codegen/exec-chain.ts`'s
 * `isExecPredecessorEdge` — that function is keyed on an `EmitContext`-shaped edge lookup this
 * file doesn't have (validation runs before codegen ever builds one), but the underlying rule
 * must stay identical or validation and codegen could disagree about which edges are
 * "structural" vs "value" ones. */
function isExecInputHandle(def: NodeDefinition, handle: string | undefined): boolean {
  const execPort = def.inputs.find((p) => p.kind === "exec") ?? def.inputs.find((p) => p.kind === undefined && p.id === "in");
  if (!execPort) return false;
  if (handle === execPort.id) return true;
  return handle === undefined && def.inputs.length === 1;
}

/** Whether this node participates in the execution spine at all (has an exec-kind or legacy
 * "in"/"out" pin on either side) — pure value nodes (operators) have neither and are excluded
 * from `computeExecArmPaths`'s BFS entirely, so their arm scope is instead *derived* from
 * their value dependencies by `resolveArmPath` below. */
function hasAnyExecPort(def: NodeDefinition): boolean {
  const execIn = def.inputs.some((p) => p.kind === "exec" || (p.kind === undefined && p.id === "in"));
  const execOut = def.outputs.some((p) => p.kind === "exec" || (p.kind === undefined && p.id === "out"));
  return execIn || execOut;
}

function execOutputHandle(def: NodeDefinition): string | undefined {
  return (def.outputs.find((p) => p.kind === "exec") ?? def.outputs.find((p) => p.kind === undefined && p.id === "out"))?.id;
}

function isPrefixOf(shorter: string[], longer: string[]): boolean {
  return shorter.length <= longer.length && shorter.every((seg, i) => seg === longer[i]);
}

/**
 * Labels every node reachable via the execution spine (starting from every node with no
 * incoming exec edge — `express.init`, a Function Graph's `logic.graphEntry`, or any other
 * exec-participating root) with its "arm path": `[]` for the trunk, before any fork;
 * `["b1.true"]` inside Branch `b1`'s True arm; `["sw1.case-3"]`; nested further for a fork
 * inside a fork. Built on the exact same `getForkArmPinIds` that `codegen/exec-chain.ts` uses
 * to decide what a fork node's arms are, so validation and codegen can never disagree about
 * scope. Pure value-only nodes (no exec pins at all) are never visited by this BFS — see
 * `resolveArmPath`, which derives their scope from their value dependencies instead.
 *
 * `seedIds`, when given, replaces the auto-detect-every-root behavior with a BFS seeded from
 * exactly those node ids (each starting at path `[]`) — used by
 * `checkBeginReachableConstOverwrite` below to ask "what's reachable from a Begin node
 * specifically," which auto-detection can't answer on its own (it would also seed from
 * `express.init`, conflating an unrelated root's trunk with Begin's). Omitting it preserves
 * today's exact behavior for both existing callers.
 */
function computeExecArmPaths(nodes: FlowNode[], edges: FlowEdge[], seedIds?: string[]): Map<string, string[]> {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const defs = new Map(nodes.map((n) => [n.id, requireNodeDefinition(n.type)]));

  const armPathOf = new Map<string, string[]>();
  const queue: Array<{ id: string; path: string[] }> = [];
  if (seedIds) {
    for (const id of seedIds) queue.push({ id, path: [] });
  } else {
    const hasIncomingExec = new Set<string>();
    for (const e of edges) {
      const targetDef = defs.get(e.target);
      if (targetDef && isExecInputHandle(targetDef, e.targetHandle)) hasIncomingExec.add(e.target);
    }
    for (const n of nodes) {
      if (hasAnyExecPort(defs.get(n.id)!) && !hasIncomingExec.has(n.id)) queue.push({ id: n.id, path: [] });
    }
  }

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (armPathOf.has(next.id)) continue;
    armPathOf.set(next.id, next.path);

    const node = nodesById.get(next.id);
    if (!node) continue;
    const forkPins = getForkArmPinIds(node);
    if (forkPins) {
      for (const pinId of forkPins) {
        for (const e of edges) {
          if (e.source === next.id && e.sourceHandle === pinId) {
            queue.push({ id: e.target, path: [...next.path, `${next.id}.${pinId}`] });
          }
        }
      }
      continue;
    }

    // Loop-container array nodes (map/filter/reduce/etc.) differ from Branch/Switch/Sequence:
    // `bodyPin`'s target is a nested arm (repeats per element, like a fork arm), but
    // `completedPin`'s target continues in the SAME scope as the loop node itself — after the
    // assembled `.map()`/`.reduce()` statement, execution just continues in the enclosing
    // block, it doesn't open a fresh one the way a Branch/Switch arm does. Reusing
    // `getForkArmPinIds`'s "nested-only" semantics for `completedPin` would wrongly let
    // `checkBeginReachableConstOverwrite` treat it as "safely inside its own block."
    const loopShape: LoopShape | undefined = defs.get(next.id)!.loopShape;
    if (loopShape) {
      for (const e of edges) {
        if (e.source === next.id && e.sourceHandle === loopShape.bodyPin) {
          queue.push({ id: e.target, path: [...next.path, `${next.id}.${loopShape.bodyPin}`] });
        }
      }
      for (const e of edges) {
        if (e.source === next.id && e.sourceHandle === loopShape.completedPin) {
          queue.push({ id: e.target, path: next.path });
        }
      }
      continue;
    }

    const def = defs.get(next.id)!;
    const outHandle = execOutputHandle(def);
    if (outHandle === undefined) continue;
    for (const e of edges) {
      if (e.source === next.id && (e.sourceHandle === outHandle || (e.sourceHandle === undefined && def.outputs.length === 1))) {
        queue.push({ id: e.target, path: next.path });
      }
    }
  }

  return armPathOf;
}

/**
 * Resolves the effective arm path used to decide whether reading `nodeId`'s value from some
 * other point in the graph is legal. Exec-spine nodes (found in `armPathOf`) use their fixed,
 * BFS-assigned path — this covers `logic.graphReturn` too (Phase 12 gave it a real exec-in
 * pin): an unwired Return is its own BFS root at path `[]` (trunk, matching the backward-compat
 * fallback in `emit-function-graph.ts`), while a Return wired into a Branch/Switch arm gets
 * that arm's real nested path, exactly like any other exec-participating node — no special
 * case needed here. Every other node (a pure value node with no exec pins) derives its path
 * from the join of its own value dependencies' resolved paths — the most specific (deepest)
 * one, as long as they're mutually consistent (each a prefix of the other); an inconsistent
 * join (combining two sibling arms' values into one pure node) is left for the edge-level check
 * in `checkCrossArmValueReferences` to report concretely. This is what lets a value node fed
 * only from the trunk (or from a single arm) be safely referenced whenever it's actually
 * reachable, while a value that only exists inside one arm still can't leak into a sibling arm
 * or the trunk.
 */
/**
 * A loop node's own context pins (element/index/arrayRef/accumulator) are only valid INSIDE
 * its own loop body — unlike Branch/Switch, which own no arm-scoped value pins themselves, a
 * loop node's `armPathOf`/`resolveArmPath` entry is its pre-loop (trunk) path, not the nested
 * body arm. Given an edge's source node id/handle and that source's own resolved `basePath`,
 * returns the effective path a READER of this specific pin should be checked against — the
 * nested body-arm path for a context-pin handle, or `null` for every other handle (meaning:
 * use `basePath` unchanged). Shared by `resolveArmPath` (so a pure value node fed from a
 * context pin inherits the nested path too) and `checkCrossArmValueReferences` (so a DIRECT
 * reader of the pin is checked against it) — both need the identical rule or they'd disagree.
 */
function loopContextArmPath(sourceId: string, sourceHandle: string | undefined, sourceDef: NodeDefinition, basePath: string[]): string[] | null {
  const loop = sourceDef.loopShape;
  if (!loop || !loop.contextPinIds.includes(sourceHandle ?? "")) return null;
  return [...basePath, `${sourceId}.${loop.bodyPin}`];
}

function resolveArmPath(
  nodeId: string,
  nodesById: Map<string, FlowNode>,
  edges: FlowEdge[],
  armPathOf: Map<string, string[]>,
  memo: Map<string, string[]>,
  inProgress: Set<string>,
): string[] {
  const fixed = armPathOf.get(nodeId);
  if (fixed) return fixed;
  const cached = memo.get(nodeId);
  if (cached) return cached;

  const node = nodesById.get(nodeId);
  if (!node) return [];
  if (inProgress.has(nodeId)) return []; // defensive only: a real cycle is already rejected elsewhere
  inProgress.add(nodeId);

  const def = requireNodeDefinition(node.type);
  const valueDeps = edges.filter((e) => e.target === nodeId && !isExecInputHandle(def, e.targetHandle));

  let best: string[] = [];
  for (const dep of valueDeps) {
    const depSourceNode = nodesById.get(dep.source);
    const depBase = resolveArmPath(dep.source, nodesById, edges, armPathOf, memo, inProgress);
    const depPath = depSourceNode
      ? (loopContextArmPath(dep.source, dep.sourceHandle, requireNodeDefinition(depSourceNode.type), depBase) ?? depBase)
      : depBase;
    if (isPrefixOf(best, depPath)) {
      best = depPath;
    }
    // else: `depPath` isn't more specific than (or consistent with) `best` — an inconsistent
    // combination that `checkCrossArmValueReferences` will report at the offending edge(s).
  }

  inProgress.delete(nodeId);
  memo.set(nodeId, best);
  return best;
}

/**
 * Best-effort "cross-arm value reference" check: a value computed only inside one Branch/
 * Switch arm can't be read from a sibling arm, from the trunk, or from a Return node that
 * isn't itself part of that same arm. Catches the concrete failure mode exec-chain.ts's
 * hoisting can't safely paper over: reading an exec-spine node's value (e.g. a
 * `logic.functionCall`'s result, or a Return's "Value" pin — Phase 12 made `logic.graphReturn`
 * a real arm-scoped exec participant, so this now falls out of the same generic rule as any
 * other node rather than a Return-specific special case) from outside the arm that owns it. A
 * value-only node with no exec pins (operators) fed *purely* from the trunk or from a single
 * consistent arm is unaffected — that's the explicitly-supported "same upstream value node
 * wired into both arms' consumers" pattern, safe because `hoistValueDeps` re-hoists it
 * independently per arm.
 *
 * Deliberately does NOT trace through a chain of several pure nodes to find the ultimate
 * exec-owned source in every possible topology beyond what `resolveArmPath`'s recursive join
 * already covers — this is the "partial/simplified" version explicitly permitted for this
 * check; see the implementation task's write-up for what's covered vs. not. Wrapped in a
 * try/catch so an unexpected shape here can never destabilize the higher-value checks above.
 */
function checkCrossArmValueReferences(
  nodes: FlowNode[],
  edges: FlowEdge[],
  makeError: (nodeId: string, message: string) => ValidationError,
): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const armPathOf = computeExecArmPaths(nodes, edges);
    const memo = new Map<string, string[]>();
    const inProgress = new Set<string>();
    const resolve = (id: string) => resolveArmPath(id, nodesById, edges, armPathOf, memo, inProgress);

    const reported = new Set<string>();
    for (const edge of edges) {
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      if (!sourceNode || !targetNode) continue;

      const targetDef = requireNodeDefinition(targetNode.type);
      if (isExecInputHandle(targetDef, edge.targetHandle)) continue; // structural edge, not a value read

      // See `loopContextArmPath`'s doc comment: a loop node's context pins (element/index/
      // arrayRef/accumulator) resolve to its nested body-arm path, not its own (trunk) path.
      const sourceBase = resolve(edge.source);
      const sourcePath = loopContextArmPath(edge.source, edge.sourceHandle, requireNodeDefinition(sourceNode.type), sourceBase) ?? sourceBase;
      const targetPath = resolve(edge.target);
      if (isPrefixOf(sourcePath, targetPath)) continue;

      const armLabel = sourcePath.join(" > ");
      const message =
        `Node "${targetNode.id}" reads a value from node "${sourceNode.id}", which is computed only inside Branch/Switch ` +
        `arm "${armLabel}" that "${targetNode.id}" isn't part of.`;

      const key = `${targetNode.id}:${sourceNode.id}:${message}`;
      if (reported.has(key)) continue;
      reported.add(key);
      errors.push(makeError(targetNode.id, message));
    }
  } catch {
    // Supplementary, best-effort check — never let an unexpected node/edge shape here block
    // the higher-value structural checks (operator arity, Branch/Switch wiring) above.
  }
  return errors;
}

/**
 * Begin's emitted `setup` is raw, un-blocked module-top-level code (see
 * `nodes/logic/begin.node.ts`) — the one exec-chain owner in this codebase with no enclosing
 * function/handler scope (deliberately: that's what lets a `const`-with-no-default variable
 * get its real top-level declaration from a Begin-driven Set at all). A `variable.set` node
 * with an EMPTY Begin-relative arm path therefore sits in the exact same lexical scope as the
 * module-level variable-declarations loop (`emit-express.ts`, order 1); one reached through a
 * Branch/Switch arm instead gets that arm's own `{ }` block, a fresh scope regardless of what
 * it declares, so it's excluded. Reuses `computeExecArmPaths` (seeded from Begin nodes only) so
 * this can never disagree with what `exec-chain.ts` actually emits.
 *
 * This function computes which `const` variables with defaults have an overriding Set node from
 * Begin and should skip their default emission (see `emit-express.ts`). Returns a Set of
 * variable ids that should NOT emit their defaults because a Set node will declare them instead.
 */
export function getConstVariablesOverriddenFromBegin(
  flow: Flow,
): Set<string> {
  const beginIds = flow.nodes.filter((n) => n.type === "logic.begin").map((n) => n.id);
  if (beginIds.length === 0) return new Set();

  const armPathOf = computeExecArmPaths(flow.nodes, flow.edges, beginIds);
  const variablesById = new Map((flow.variables ?? []).map((v) => [v.id, v]));
  const overridden = new Set<string>();

  for (const n of flow.nodes) {
    if (n.type !== "variable.set") continue;
    const path = armPathOf.get(n.id);
    if (!path || path.length > 0) continue; // not Begin-reachable, or safely inside an arm's own block

    const variableId = (n.data as Record<string, unknown> | undefined)?.variableId;
    const variable = typeof variableId === "string" ? variablesById.get(variableId) : undefined;
    // Only const variables can be overridden — let/var variables still need their default
    // declaration since a Set node on them emits a bare assignment, not a const redeclaration.
    if (variable?.keyword === "const") {
      overridden.add(variableId as string);
    }
  }
  return overridden;
}

function detectCycle(flow: Flow): ValidationError | null {
  const adjacency = new Map<string, string[]>();
  for (const node of flow.nodes) adjacency.set(node.id, []);
  for (const edge of flow.edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(flow.nodes.map((n) => [n.id, WHITE]));

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next);
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const node of flow.nodes) {
    if (color.get(node.id) === WHITE && visit(node.id)) {
      return { message: "Flow graph contains a cycle; backend flows must be acyclic (DAG)" };
    }
  }
  return null;
}
