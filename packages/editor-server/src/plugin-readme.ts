import { access, writeFile } from "node:fs/promises";
import path from "node:path";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const PLUGIN_README_CONTENT = `# Creating Custom Plugin Nodes for Visual Node

Visual Node's node picker isn't limited to the built-in nodes — you can write a single JSON
file describing a new node (its ports, its config fields, and how it generates code) and
install it directly from the editor. No TypeScript, no rebuild, no restart.

## Quick start

1. In the editor, click **"Download Plugin Template"** in the toolbar to get a working
   example (an "HTTP Request" node wrapping axios) to copy and modify.
2. Edit the file — see the field reference below.
3. Click **"Install Plugin"** and pick your file. It's validated immediately (every problem
   is listed at once, not just the first) and, if valid, registered live — it shows up in
   **"Browse Nodes"** right away with an amber "Plugin" badge, no restart needed.

Installed plugins are saved into \`.visualnode/plugins/\` inside this project directory and
are automatically reloaded every time this project is opened — you only need to install
once per project.

## The plugin file format

A plugin is a single JSON object with this shape:

\`\`\`json
{
  "schemaVersion": 1,
  "type": "plugin.myCustomNode",
  "category": "logic",
  "label": "My Custom Node",
  "description": "What this node does, shown in the node picker.",
  "inputs": [
    { "id": "in", "label": "In", "kind": "exec" },
    { "id": "someValue", "label": "Some Value", "kind": "value" }
  ],
  "outputs": [
    { "id": "out", "label": "Out", "kind": "exec" },
    { "id": "result", "label": "Result", "kind": "value" }
  ],
  "configSchema": [
    { "key": "option", "label": "Option", "type": "text", "default": "" }
  ],
  "npmDependencies": { "some-package": "^1.0.0" },
  "async": false,
  "codegen": {
    "imports": ["const somePackage = require(\\"some-package\\");"],
    "body": "const {{result}} = somePackage.doSomething({{someValue}}, {{config.option}});"
  }
}
\`\`\`

### Top-level fields

| Field | Required | Notes |
|---|---|---|
| \`schemaVersion\` | yes | Always \`1\`. |
| \`type\` | yes | Must match \`plugin.<Name>\` (e.g. \`plugin.httpRequest\`) — the \`plugin.\` prefix is required and keeps you from ever colliding with a built-in node type. Must be globally unique in this project. |
| \`category\` | yes | One of: \`server\`, \`routing\`, \`middleware\`, \`handler\`, \`logic\`, \`debugging\`, \`operators\`, \`controlFlow\`. Controls the node's header color/icon and which group it appears under in the node picker. Pick whichever existing category best matches what your node does — there is no way to add a new category via a plugin. |
| \`label\` | yes | Short display name shown on the node and in the picker. |
| \`description\` | yes | Longer description shown as a tooltip / in the node picker card. |
| \`inputs\` / \`outputs\` | yes (can be empty arrays) | See "Ports" below. |
| \`configSchema\` | yes (can be an empty array) | See "Config fields" below. |
| \`npmDependencies\` | no | \`{ "package-name": "version-range" }\`. Automatically merged into the generated project's \`package.json\` whenever any instance of this node type is used — you never need to declare it separately. |
| \`async\` | no, default \`false\` | Set to \`true\` if your \`codegen.body\`/\`codegen.setup\` uses \`await\`. This makes the compiler require the containing Route/Function/Middleware's "Async Handler"/"Async Function" checkbox to be enabled, with a clear error if it isn't — instead of silently generating invalid JavaScript. |
| \`codegen\` | yes | See "Codegen templates" below. |

### Ports

Each entry in \`inputs\`/\`outputs\` is \`{ "id": string, "label": string, "kind": "exec" | "value" }\`.
\`kind\` is **required** on every port (unlike built-in nodes, where it's inferred by
convention).

- **\`"exec"\` ports** connect nodes in a request-handling chain (the white arrowhead pins,
  e.g. Route → your node → another node). Rules:
  - At most **one** exec-input, and its \`id\` **must be \`"in"\`**.
  - At most **one** exec-output, and its \`id\` **must be \`"out"\`**.
  - Omit both entirely to make a pure value-computation node (like a built-in operator —
    no execution position, just a value other nodes can wire from).
  - A plugin **cannot** have more than one exec-output (no Branch/Switch-style forking —
    that's a special codegen capability not available to plugins).
- **\`"value"\` ports** carry data (the colored-circle pins). You can have any number of
  value **inputs**, but **at most one** value **output**.
- Value-input pins do **not** get an inline literal editor on the canvas the way built-in
  nodes' pins do — if you want a user-editable default that doesn't require wiring, use a
  \`configSchema\` field instead, and reserve \`inputs\` for things meant to be wired from an
  upstream node.

### Config fields

Each entry in \`configSchema\` is
\`{ "key": string, "label": string, "type": "text"|"select"|"number"|"code"|"boolean", "options"?: string[], "default"?: any, "hint"?: string }\`.

- \`"select"\` requires a non-empty \`options\` array.
- \`"code"\` renders a larger code-editor field and, when referenced in a codegen template
  (see below), is substituted **verbatim** (raw text) rather than quoted — use it for
  anything meant to be actual JavaScript.
- \`key\` must be unique within \`configSchema\`.

### Codegen templates

\`codegen\` is \`{ "imports"?: string[], "setup"?: string, "body"?: string, "order"?: number }\`
— at least one of \`imports\`/\`setup\`/\`body\` must be present.

- **\`imports\`** — one or more \`require(...)\` lines, always safe to place here regardless
  of where the node sits in the flow; they get deduplicated and hoisted to the top of the
  generated file automatically.
- **\`body\`** — code that runs inside the request handler / function, in this node's
  position in the chain. This is where wired value-inputs and \`req\`/\`res\`-style logic
  belong.
- **\`setup\`** — code that runs once at the top level of the generated file (outside any
  request handler). Don't reference wired value-inputs here — they're per-request and won't
  exist at module-load time. Most plugins only need \`imports\` + \`body\`.
- **\`order\`** — only relevant for \`setup\` fragments; controls where among other top-level
  statements this one lands (lower runs earlier). Usually safe to omit.

Every string in \`imports\`/\`setup\`/\`body\` is scanned for \`{{placeholder}}\` tokens, each of
which must be exactly one of:

- **\`{{result}}\`** — a stable variable name for this node's own value output. Requires you
  to have declared exactly one \`kind: "value"\` output; conversely, if you declare a value
  output, \`{{result}}\` must appear somewhere in your templates (otherwise the value is
  never assigned, which is almost certainly a mistake and is rejected at install time).
- **\`{{config.someKey}}\`** — the current value of a \`configSchema\` field named
  \`someKey\` (or its \`default\` if unset). Quoted safely (\`JSON.stringify\`) for every field
  type except \`"code"\`, which is inserted verbatim.
- **\`{{somePinId}}\`** — a bare id matching a declared \`kind: "value"\` **input** pin.
  Resolves to whatever expression is wired into it, or \`undefined\` if left unwired.

All of these are validated the moment you click "Install Plugin" — an undeclared
placeholder, a placeholder pointing at an exec pin, or a mismatched \`{{result}}\`/value-output
pairing is rejected with a specific error message before the file is ever saved.

## Two worked examples

**Chain-position, async, wraps a network call** (the downloadable template):

\`\`\`json
{
  "schemaVersion": 1,
  "type": "plugin.httpRequest",
  "category": "logic",
  "label": "HTTP Request",
  "description": "Makes an HTTP request via axios and exposes the response.",
  "inputs": [
    { "id": "in", "label": "In", "kind": "exec" },
    { "id": "body", "label": "Body", "kind": "value" }
  ],
  "outputs": [
    { "id": "out", "label": "Out", "kind": "exec" },
    { "id": "response", "label": "Response", "kind": "value" }
  ],
  "configSchema": [
    { "key": "url", "label": "URL", "type": "text", "default": "https://api.example.com" },
    { "key": "method", "label": "Method", "type": "select", "options": ["GET", "POST", "PUT", "DELETE"], "default": "GET" }
  ],
  "npmDependencies": { "axios": "^1.7.0" },
  "async": true,
  "codegen": {
    "imports": ["const axios = require(\\"axios\\");"],
    "body": "const {{result}} = await axios({ method: {{config.method}}, url: {{config.url}}, data: {{body}} });"
  }
}
\`\`\`
Place this in a Route's handler chain and enable that Route's "Async Handler" checkbox.

**Terminal, synchronous, zero outputs — a self-contained handler:**

\`\`\`json
{
  "schemaVersion": 1,
  "type": "plugin.uuidResponder",
  "category": "handler",
  "label": "UUID Responder",
  "description": "Generates a UUID via the npm uuid package and responds with it as JSON.",
  "inputs": [{ "id": "in", "label": "In", "kind": "exec" }],
  "outputs": [],
  "configSchema": [],
  "npmDependencies": { "uuid": "^9.0.0" },
  "codegen": {
    "imports": ["const { v4: uuidv4 } = require(\\"uuid\\");"],
    "body": "res.json({ id: uuidv4() });"
  }
}
\`\`\`
No \`async\`, no value output — this node does its own thing and responds directly, exactly
like the built-in "Send JSON" node's shape (\`outputs: []\`). Wire a Route straight into it
and nothing needs to come after.

These two examples are deliberately as different as possible (different packages,
different categories, async vs. sync, one value output vs. zero, chain-through vs.
terminal) to show the range of what a plugin can be — it is **not** limited to
HTTP-style nodes.

## Limitations to know about

- **No update-in-place.** Re-installing a \`type\` that's already registered (built-in or a
  previously installed plugin) is rejected. While iterating on a plugin, just bump the
  \`type\` (e.g. \`plugin.myCustomNode2\`) until you're happy, then clean up the old
  \`.visualnode/plugins/*.node.json\` file if you want.
- **No multi-arm branching.** A plugin can't create new Branch/Switch-style forks — that
  requires codegen capabilities not exposed to the plugin format. Use the built-in Branch/
  Switch nodes for conditional flow, and plugins for everything else.
- **At most one value output per plugin.** If you need multiple distinct output values,
  split the work across more than one plugin node, or use a Function node.
- **Trust model:** a plugin's \`codegen\` strings are spliced verbatim into the generated
  server code — the same trust level as typing raw JavaScript into a Custom Code node.
  There's no sandboxing. This is appropriate for a local, single-developer tool; don't
  install a plugin file from a source you don't trust, same as you wouldn't paste
  untrusted code into a Custom Code node.
`;

/**
 * Writes README.PLUGIN.md into `projectDir` if it doesn't already exist — a guide to
 * authoring/installing Phase 9 plugin nodes, scaffolded once per project (on every
 * editor-server startup, via `server.ts`) so a user never has to go looking for this
 * documentation elsewhere. Write-once, like the original (pre-merge) package.json
 * behavior: unlike `dependencies`, there's nothing to usefully merge into a prose guide, so
 * an existing file (including one the user has since edited) is never touched again.
 */
export async function ensurePluginReadme(projectDir: string): Promise<void> {
  const readmePath = path.join(projectDir, "README.PLUGIN.md");
  if (await pathExists(readmePath)) return;
  await writeFile(readmePath, PLUGIN_README_CONTENT, "utf8");
}
