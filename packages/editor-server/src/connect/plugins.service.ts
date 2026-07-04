import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectRouter } from "@connectrpc/connect";
import { EditorService } from "@flowserver/proto-gen";
import {
  createPluginNodeDefinition,
  getNodeDefinition,
  registerNode,
  validatePluginNodeSpec,
  type PluginNodeSpec,
} from "@flowserver/core";
import type { AppConfig } from "../config.js";
import { resolveSafePath } from "../path-safety.js";

/**
 * Registers the `InstallPlugin` RPC (Phase 9 Part B — JSON-based plugin node system, see
 * packages/core/src/plugins/plugin-schema.ts and plugin-node.ts). Uploading a plugin is
 * equivalent in trust level to writing a Custom Code node: the spec's `codegen`
 * imports/setup/body strings are spliced verbatim into generated server code with no
 * sandboxing — appropriate for a local single-developer tool.
 *
 * Always returns `{ ok: false, errors: [...] }` rather than throwing a `ConnectError` on any
 * expected failure (malformed JSON, spec validation errors, type collision, unsafe path) —
 * same "expected failure modeled as response data" pattern as
 * ValidateFlowResponse/GenerateCodeResponse in connect/validate-generate.service.ts, rather
 * than the `ConnectError`-throwing pattern connect/files.service.ts uses for its CRUD RPCs.
 *
 * On success, the validated spec is written to
 * `<projectDir>/.flowserver/plugins/<sanitized-type>.node.json` (the leading dot directory
 * means file-tree.ts's existing dotfile filter already hides it from the file explorer with
 * zero changes there) and immediately `registerNode()`-ed — live for the very next
 * `GetNodeRegistry` call, no restart needed. Re-uploading a `type` that's already registered
 * (builtin or a previously installed plugin) is rejected outright: `registerNode()` has no
 * update path in this codebase, so iterating on a plugin requires renaming its `type`.
 */
export function registerPluginsRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  router.rpc(EditorService.method.installPlugin, async (req) => {
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(req.pluginJson).toString("utf8"));
    } catch (err) {
      return {
        ok: false,
        type: "",
        relativePath: "",
        errors: [`\`plugin_json\` is not valid JSON: ${err instanceof Error ? err.message : String(err)}`],
      };
    }

    const validationErrors = validatePluginNodeSpec(raw);
    if (validationErrors.length > 0) {
      return { ok: false, type: "", relativePath: "", errors: validationErrors };
    }

    // Safe: validatePluginNodeSpec(raw) returned no errors above.
    const spec = raw as PluginNodeSpec;

    if (getNodeDefinition(spec.type)) {
      return {
        ok: false,
        type: "",
        relativePath: "",
        errors: [`Node type "${spec.type}" is already registered`],
      };
    }

    const filename = `${spec.type.replace(/[^A-Za-z0-9_.-]/g, "_")}.node.json`;
    const relativePath = `.flowserver/plugins/${filename}`;
    const target = resolveSafePath(config.projectDir, relativePath);
    if (!target) {
      return {
        ok: false,
        type: "",
        relativePath: "",
        errors: [`Could not resolve a safe on-disk path for plugin type "${spec.type}"`],
      };
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(spec, null, 2), "utf8");

    registerNode(createPluginNodeDefinition(spec));

    return { ok: true, type: spec.type, relativePath, errors: [] };
  });

  return router;
}
