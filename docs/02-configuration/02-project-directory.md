---
title: Project Directory
---

# Project Directory

visual-node is a **single-project** tool: one editor-server instance always works against
exactly one project directory (resolved as described in [Environment
Variables](/configuration/environment-variables)). Everything it reads and writes lives
inside that folder.

## What lives in a project directory

| Path | Purpose |
| --- | --- |
| `*.blueprint` files | Your flows' source of truth — a file explorer inside the editor lets you create your own folder/file layout. Stored on disk as a compact binary format (FlatBuffers/FlexBuffers), not JSON, though the extension stays `.blueprint`. |
| Generated `*.js` files | Whatever "Compile" produces — plain CommonJS Express source, one output file per `.blueprint` file, written next to your flow files. |
| `package.json` | Created/merged automatically the first time you compile — declares `express` plus any npm packages your flow nodes require (see `logic.require` and Custom Code/Function nodes' `npmDependencies` fields in the [Node Reference](/node-reference)). |
| `.flowserver/plugins/` | Installed [plugin](/plugins) node definitions (hidden from the file explorer). |
| `README.PLUGIN.md` | A full plugin-authoring guide, scaffolded automatically into every project the first time its editor-server starts. |

## Multi-file projects

You aren't limited to a single flow. Organize `.blueprint` files into your own
folder/file tree via the editor's file explorer, write reusable functions in one file,
mark the ones you want to share with `logic.export`, and pull them into another file with
`logic.require` (source type "Local"). Hitting **Compile** compiles every `.blueprint`
file in the project at once, so cross-file `require()`s between them resolve correctly —
not just the one file you currently have open.

See [Configuration](/configuration/environment-variables), the [Logic section of the Node
Reference](/node-reference/logic) for `logic.function`/`logic.export`/`logic.require`, and
[Examples](/examples) for complete worked projects.
