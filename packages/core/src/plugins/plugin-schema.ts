import type { NodeCategory } from "../schema/node-registry.js";

/**
 * The `.node.json` on-disk/uploaded shape for a JSON-based plugin node (Phase 9 Part B —
 * see docs/phase9-npm-package-support-plan.md). Unlike the core `PortDefinition`, `kind` is
 * REQUIRED here (not optional) since a plugin has no legacy id-naming-convention fallback to
 * lean on the way pre-Phase-7 builtin nodes do.
 */
export interface PluginPortSpec {
  id: string;
  label: string;
  kind: "exec" | "value";
}

export interface PluginConfigFieldSpec {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "code" | "boolean";
  options?: string[];
  default?: string | number | boolean;
  hint?: string;
}

export interface PluginCodeTemplate {
  imports?: string[];
  setup?: string;
  body?: string;
  order?: number;
}

export interface PluginNodeSpec {
  schemaVersion: 1;
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: PluginPortSpec[];
  outputs: PluginPortSpec[];
  configSchema: PluginConfigFieldSpec[];
  npmDependencies?: Record<string, string>;
  async?: boolean;
  codegen: PluginCodeTemplate;
}

/**
 * Hardcoded rather than imported/derived at runtime from `NodeCategory`: that's a
 * TypeScript-only type union with no runtime array to check against, and `node-registry.ts`
 * belongs to another already-completed workstream that shouldn't need further edits for this
 * one. Keep in sync with `NodeCategory` in `../schema/node-registry.ts` if it ever grows.
 */
const NODE_CATEGORIES: readonly string[] = [
  "server",
  "routing",
  "middleware",
  "handler",
  "logic",
  "debugging",
  "operators",
  "controlFlow",
];

const CONFIG_FIELD_TYPES: readonly string[] = ["text", "select", "number", "code", "boolean"];

const TYPE_RE = /^plugin\.[A-Za-z][A-Za-z0-9]*$/;
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Collects every `{{placeholder}}` name referenced across the three template strings. */
function findPlaceholders(templates: string[]): string[] {
  const found: string[] = [];
  for (const template of templates) {
    if (typeof template !== "string") continue;
    for (const match of template.matchAll(PLACEHOLDER_RE)) {
      found.push(match[1]);
    }
  }
  return found;
}

/**
 * Validates a raw, untrusted value against the `PluginNodeSpec` shape, returning every
 * problem found (never throws, never stops at the first issue) so a plugin author gets a
 * complete list of what to fix in one pass.
 */
export function validatePluginNodeSpec(raw: unknown): string[] {
  const errors: string[] = [];

  if (!isPlainObject(raw)) {
    errors.push("Plugin spec must be a JSON object.");
    return errors;
  }

  if (raw.schemaVersion !== 1) {
    errors.push(`"schemaVersion" must be exactly 1 (got ${JSON.stringify(raw.schemaVersion)}).`);
  }

  if (!isNonEmptyString(raw.type)) {
    errors.push('"type" must be a non-empty string.');
  } else if (!TYPE_RE.test(raw.type)) {
    errors.push(
      `"type" ("${raw.type}") must match /^plugin\\.[A-Za-z][A-Za-z0-9]*$/ (e.g. "plugin.httpRequest").`,
    );
  }

  if (!isNonEmptyString(raw.category) || !NODE_CATEGORIES.includes(raw.category)) {
    errors.push(`"category" (${JSON.stringify(raw.category)}) must be one of: ${NODE_CATEGORIES.join(", ")}.`);
  }

  if (!isNonEmptyString(raw.label)) {
    errors.push('"label" must be a non-empty string.');
  }
  if (!isNonEmptyString(raw.description)) {
    errors.push('"description" must be a non-empty string.');
  }

  // --- inputs / outputs -----------------------------------------------------------------
  const validValueInputIds = new Set<string>();

  function validatePorts(value: unknown, fieldName: "inputs" | "outputs"): PluginPortSpec[] {
    if (!Array.isArray(value)) {
      errors.push(`"${fieldName}" must be an array.`);
      return [];
    }
    const ports: PluginPortSpec[] = [];
    const seenIds = new Set<string>();
    let execCount = 0;
    let valueOutputCount = 0;

    value.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        errors.push(`"${fieldName}[${index}]" must be an object.`);
        return;
      }
      const id = entry.id;
      const label = entry.label;
      const kind = entry.kind;

      if (!isNonEmptyString(id)) {
        errors.push(`"${fieldName}[${index}].id" must be a non-empty string.`);
      } else if (seenIds.has(id)) {
        errors.push(`"${fieldName}" has a duplicate port id "${id}" — ids must be unique within "${fieldName}".`);
      } else {
        seenIds.add(id);
      }

      if (!isNonEmptyString(label)) {
        errors.push(`"${fieldName}[${index}].label" must be a non-empty string.`);
      }

      if (kind !== "exec" && kind !== "value") {
        errors.push(
          `"${fieldName}[${index}].kind" is required and must be exactly "exec" or "value" (got ${JSON.stringify(kind)}).`,
        );
      } else {
        if (kind === "exec") execCount++;
        if (fieldName === "outputs" && kind === "value") valueOutputCount++;
        if (isNonEmptyString(id)) {
          if (kind === "value" && fieldName === "inputs") validValueInputIds.add(id);
          ports.push({ id, label: isNonEmptyString(label) ? label : "", kind });
        }
      }
    });

    if (execCount > 1) {
      errors.push(`"${fieldName}" may declare at most one "exec"-kind port (found ${execCount}).`);
    }
    if (fieldName === "inputs" && execCount === 1) {
      const execPort = ports.find((p) => p.kind === "exec");
      if (execPort && execPort.id !== "in") {
        errors.push(
          `"inputs" declares an "exec"-kind port with id "${execPort.id}" — it must be id "in" (exec-chain.ts's walker hardcodes this literal id).`,
        );
      }
    }
    if (fieldName === "outputs" && execCount === 1) {
      const execPort = ports.find((p) => p.kind === "exec");
      if (execPort && execPort.id !== "out") {
        errors.push(
          `"outputs" declares an "exec"-kind port with id "${execPort.id}" — it must be id "out" (exec-chain.ts's exec-chain walker hardcodes the literal pin id "out" when advancing the chain, so any other id would silently never be followed).`,
        );
      }
    }
    if (fieldName === "outputs" && valueOutputCount > 1) {
      errors.push(
        `"outputs" may declare at most one "value"-kind port (found ${valueOutputCount}) — multi-value outputs need a handle-aware resultIdentifier, not supported for plugin nodes in v1.`,
      );
    }

    return ports;
  }

  validatePorts(raw.inputs, "inputs");
  const outputPorts = validatePorts(raw.outputs, "outputs");
  const hasValueOutput = outputPorts.some((p) => p.kind === "value");

  // --- configSchema ----------------------------------------------------------------------
  const validConfigKeys = new Set<string>();
  if (!Array.isArray(raw.configSchema)) {
    errors.push('"configSchema" must be an array.');
  } else {
    const seenKeys = new Set<string>();
    raw.configSchema.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        errors.push(`"configSchema[${index}]" must be an object.`);
        return;
      }
      const key = entry.key;
      const label = entry.label;
      const type = entry.type;

      if (!isNonEmptyString(key)) {
        errors.push(`"configSchema[${index}].key" must be a non-empty string.`);
      } else if (seenKeys.has(key)) {
        errors.push(`"configSchema" has a duplicate key "${key}" — keys must be unique.`);
      } else {
        seenKeys.add(key);
        validConfigKeys.add(key);
      }

      if (!isNonEmptyString(label)) {
        errors.push(`"configSchema[${index}].label" must be a non-empty string.`);
      }

      if (!isNonEmptyString(type) || !CONFIG_FIELD_TYPES.includes(type)) {
        errors.push(
          `"configSchema[${index}].type" (${JSON.stringify(type)}) must be one of: ${CONFIG_FIELD_TYPES.join(", ")}.`,
        );
      } else if (type === "select") {
        if (!Array.isArray(entry.options) || entry.options.length === 0) {
          errors.push(`"configSchema[${index}]" has type "select" but no non-empty "options" array.`);
        }
      }
    });
  }

  // --- npmDependencies ---------------------------------------------------------------------
  if (raw.npmDependencies !== undefined) {
    if (!isPlainObject(raw.npmDependencies)) {
      errors.push('"npmDependencies" must be a plain object of string -> string.');
    } else {
      for (const [pkg, version] of Object.entries(raw.npmDependencies)) {
        if (typeof version !== "string") {
          errors.push(`"npmDependencies.${pkg}" must be a string (got ${JSON.stringify(version)}).`);
        }
      }
    }
  }

  // --- async ---------------------------------------------------------------------------
  if (raw.async !== undefined && typeof raw.async !== "boolean") {
    errors.push(`"async" must be a boolean (got ${JSON.stringify(raw.async)}).`);
  }

  // --- codegen + placeholder validation ---------------------------------------------------
  if (!isPlainObject(raw.codegen)) {
    errors.push('"codegen" must be an object.');
  } else {
    const codegen = raw.codegen;
    const hasImports = Array.isArray(codegen.imports) && codegen.imports.length > 0;
    const hasSetup = isNonEmptyString(codegen.setup);
    const hasBody = isNonEmptyString(codegen.body);

    if (codegen.imports !== undefined && !Array.isArray(codegen.imports)) {
      errors.push('"codegen.imports" must be an array of strings.');
    }
    if (codegen.setup !== undefined && typeof codegen.setup !== "string") {
      errors.push('"codegen.setup" must be a string.');
    }
    if (codegen.body !== undefined && typeof codegen.body !== "string") {
      errors.push('"codegen.body" must be a string.');
    }

    if (!hasImports && !hasSetup && !hasBody) {
      errors.push('"codegen" must declare at least one non-empty "imports", "setup", or "body".');
    }

    const templateStrings: string[] = [];
    if (Array.isArray(codegen.imports)) {
      for (const entry of codegen.imports) {
        if (typeof entry === "string") templateStrings.push(entry);
      }
    }
    if (typeof codegen.setup === "string") templateStrings.push(codegen.setup);
    if (typeof codegen.body === "string") templateStrings.push(codegen.body);

    const placeholders = findPlaceholders(templateStrings);
    let usesResult = false;

    for (const name of placeholders) {
      if (name === "result") {
        usesResult = true;
        continue;
      }
      if (name.startsWith("config.")) {
        const key = name.slice("config.".length);
        if (!validConfigKeys.has(key)) {
          errors.push(
            `codegen template references "{{${name}}}" but no configSchema entry has key "${key}".`,
          );
        }
        continue;
      }
      if (validValueInputIds.has(name)) {
        continue;
      }
      errors.push(
        `codegen template references undeclared/invalid placeholder "{{${name}}}" — it must be "result", "config.<key>" for a declared configSchema key, or the id of a declared "value"-kind input pin.`,
      );
    }

    if (usesResult && !hasValueOutput) {
      errors.push('codegen template uses "{{result}}" but no "value"-kind output port is declared in "outputs".');
    }
    if (hasValueOutput && !usesResult) {
      errors.push(
        'A "value"-kind output port is declared in "outputs" but no codegen template ("imports"/"setup"/"body") ever uses "{{result}}".',
      );
    }
  }

  return errors;
}
