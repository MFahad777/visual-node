/**
 * A fully worked example `PluginNodeSpec` (see `packages/core/src/plugins/plugin-schema.ts`
 * for the authoritative type), offered as a downloadable starting point for authoring new
 * plugin nodes via the Toolbar's "Download Plugin Template" button. A user downloads this,
 * duplicates it, changes `type`/`label`/config defaults, and re-uploads it via "Install
 * Plugin" to wrap a different npm package.
 *
 * Kept as a plain JS object (not typed against `PluginNodeSpec`) since this module is
 * `JSON.stringify`'d verbatim for the download — no runtime value from `@flowserver/core`
 * is needed here, just a literal matching its shape.
 *
 * This template declares `"async": true`, which means the node it wraps performs `await`
 * inside generated code. For a flow containing this node to actually compile, the
 * containing Route/Function/Middleware node must have its own "Async Handler"/"Async
 * Function" checkbox enabled (Phase 9 Part C) — otherwise codegen rejects it with a clear
 * "enable the Async checkbox" error rather than emitting invalid `await`-outside-`async` JS.
 */
export const PLUGIN_NODE_TEMPLATE = {
  schemaVersion: 1,
  type: "plugin.httpRequest",
  category: "logic",
  label: "HTTP Request",
  description:
    'Makes an HTTP request via axios and exposes the response. Duplicate this file, change "type" to something unique, and adjust the fields below to wrap a different npm package.',
  inputs: [
    { id: "in", label: "In", kind: "exec" },
    { id: "body", label: "Body", kind: "value" },
  ],
  outputs: [
    { id: "out", label: "Out", kind: "exec" },
    { id: "response", label: "Response", kind: "value" },
  ],
  configSchema: [
    { key: "url", label: "URL", type: "text", default: "https://api.example.com" },
    { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
  ],
  npmDependencies: { axios: "^1.7.0" },
  async: true,
  codegen: {
    imports: ['const axios = require("axios");'],
    body: "const {{result}} = await axios({ method: {{config.method}}, url: {{config.url}}, data: {{body}} });",
  },
};
