import type { NodeDefinition } from "../../schema/node-registry.js";
import { isValidNpmPackageName, isValidNpmVersion } from "./npm-dependency.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function requireSourceType(node: { data?: Record<string, unknown> }): "local" | "npm" {
  return node.data?.sourceType === "npm" ? "npm" : "local";
}

export const logicRequireNode: NodeDefinition = {
  type: "logic.require",
  category: "logic",
  label: "Require",
  description:
    "Imports another blueprint file's exports, or an installed npm package, via require(), exactly like " +
    "Node's require(). The user is responsible for knowing what properties the target exports.",
  inputs: [],
  outputs: [],
  configSchema: [
    {
      key: "sourceType",
      label: "Source",
      type: "select",
      options: ["local", "npm"],
      default: "local",
      hint: '"local" requires another .blueprint file in this project; "npm" requires an installed npm package.',
    },
    {
      key: "path",
      label: "Path",
      type: "text",
      default: "",
      hint: 'Local mode: relative path to another .blueprint file, without an extension, e.g. "../helpers/dateFormater". ' +
        'npm mode: the package name, e.g. "axios" or "@org/pkg".',
    },
    {
      key: "variableName",
      label: "Variable Name",
      type: "text",
      default: "",
      hint: 'Local variable name to bind the imported module to, e.g. "dateHelper". Must be a valid JS identifier and unique in this file.',
    },
    {
      key: "version",
      label: "Version",
      type: "text",
      default: "",
      hint: 'npm mode only. e.g. "^1.7.0". Leave blank to install unpinned ("*").',
    },
  ],
  emit: (node) => {
    const variableName = String(node.data?.variableName ?? "").trim();
    if (!IDENTIFIER_RE.test(variableName)) {
      throw new Error(`Require node "${node.id}" has an invalid variable name "${node.data?.variableName}"`);
    }

    if (requireSourceType(node) === "npm") {
      const packageName = String(node.data?.path ?? "").trim();
      if (!packageName) throw new Error(`Require node "${node.id}" has no npm package name configured`);
      if (!isValidNpmPackageName(packageName)) {
        throw new Error(`Require node "${node.id}" has an invalid npm package name "${packageName}"`);
      }
      const version = String(node.data?.version ?? "").trim();
      if (version && !isValidNpmVersion(version)) {
        throw new Error(`Require node "${node.id}" has an invalid version specifier "${version}"`);
      }
      return { imports: [`const ${variableName} = require(${JSON.stringify(packageName)});`], order: 0 };
    }

    const importPath = String(node.data?.path ?? "").trim();
    if (!importPath) throw new Error(`Require node "${node.id}" has no path configured`);
    return { imports: [`const ${variableName} = require(${JSON.stringify(importPath)});`], order: 0 };
  },
};
