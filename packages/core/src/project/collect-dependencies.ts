import { parseDependencyEntry } from "../nodes/logic/npm-dependency.js";
import { getNodeDefinition } from "../schema/node-registry.js";
import type { Flow, FlowNode } from "../schema/node.types.js";
import type { ProjectFile } from "./compile-project.js";

export interface DependencySource {
  /** Present only for `collectProjectDependencies` — the `.blueprint` file the node lives in. */
  relativePath?: string;
  nodeId: string;
  packageName: string;
  version: string;
}

export interface DependencyConflict {
  packageName: string;
  /** Every distinct non-blank version seen, in first-seen order. */
  versions: string[];
  /** The version actually written to `dependencies` — the first one encountered. */
  resolved: string;
  sources: DependencySource[];
}

export interface CollectedDependencies {
  dependencies: Record<string, string>;
  conflicts: DependencyConflict[];
}

/**
 * One raw `{packageName, version}` finding plus enough provenance to build a
 * `DependencySource` for it. Collected flat across every node (main flow + any nested
 * blueprint-mode Function graphs) before being grouped/merged by package name.
 */
interface RawFinding {
  relativePath?: string;
  nodeId: string;
  packageName: string;
  version: string;
}

/**
 * Node types (besides npm-mode `logic.require`) that carry a comma-separated
 * `npmDependencies` config field. `logic.function` only contributes this way when authored
 * in "code" mode — a blueprint-mode Function's own `npmDependencies` field (if it even has
 * one on canvas) is irrelevant since its nested graph is walked node-by-node instead.
 */
function collectFromNode(node: FlowNode, relativePath: string | undefined, out: RawFinding[]): void {
  // Type-level dependencies (e.g. a plugin node's `npmDependencies`, declared once per node
  // TYPE rather than per instance) apply to every node regardless of its category or any of
  // the per-instance branches below — multiple instances of the same type just contribute
  // the same {packageName, version} finding multiple times, which `merge()` already collapses
  // into a single `dependencies[pkg]` entry (identical versions never register as a
  // conflict; only genuinely differing versions do).
  const typeLevelDeps = getNodeDefinition(node.type)?.npmDependencies;
  if (typeLevelDeps) {
    for (const [packageName, version] of Object.entries(typeLevelDeps)) {
      out.push({ relativePath, nodeId: node.id, packageName, version: String(version) });
    }
  }

  if (node.type === "logic.require") {
    if (node.data?.sourceType === "npm") {
      const packageName = String(node.data?.path ?? "").trim();
      const version = String(node.data?.version ?? "").trim();
      if (packageName) {
        out.push({ relativePath, nodeId: node.id, packageName, version });
      }
    }
    return;
  }

  if (node.type === "logic.function" && node.data?.mode === "blueprint") {
    const graphNodes: FlowNode[] = Array.isArray(node.data?.graph?.nodes) ? node.data.graph.nodes : [];
    for (const inner of graphNodes) {
      collectFromNode(inner, relativePath, out);
    }
    return;
  }

  if (
    node.type === "handler.customCode" ||
    node.type === "middleware.customCode" ||
    (node.type === "logic.function" && node.data?.mode !== "blueprint")
  ) {
    const raw = String(node.data?.npmDependencies ?? "");
    for (const entry of raw.split(",")) {
      const parsed = parseDependencyEntry(entry);
      if (!parsed || !parsed.packageName) continue;
      out.push({ relativePath, nodeId: node.id, packageName: parsed.packageName, version: parsed.version });
    }
  }
}

function merge(findings: RawFinding[]): CollectedDependencies {
  const byPackage = new Map<string, RawFinding[]>();
  for (const finding of findings) {
    const list = byPackage.get(finding.packageName) ?? [];
    list.push(finding);
    byPackage.set(finding.packageName, list);
  }

  const dependencies: Record<string, string> = {};
  const conflicts: DependencyConflict[] = [];

  for (const [packageName, entries] of byPackage) {
    const distinctVersions: string[] = [];
    for (const entry of entries) {
      if (entry.version && !distinctVersions.includes(entry.version)) {
        distinctVersions.push(entry.version);
      }
    }

    const resolved = distinctVersions.length > 0 ? distinctVersions[0] : "*";
    dependencies[packageName] = resolved;

    if (distinctVersions.length > 1) {
      conflicts.push({
        packageName,
        versions: distinctVersions,
        resolved,
        sources: entries.map((e) => ({
          relativePath: e.relativePath,
          nodeId: e.nodeId,
          packageName: e.packageName,
          version: e.version,
        })),
      });
    }
  }

  return { dependencies, conflicts };
}

export function collectFlowDependencies(flow: Flow): CollectedDependencies {
  const findings: RawFinding[] = [];
  for (const node of flow.nodes) {
    collectFromNode(node, undefined, findings);
  }
  return merge(findings);
}

export function collectProjectDependencies(files: ProjectFile[]): CollectedDependencies {
  const findings: RawFinding[] = [];
  for (const file of files) {
    for (const node of file.flow.nodes) {
      collectFromNode(node, file.relativePath, findings);
    }
  }
  return merge(findings);
}
