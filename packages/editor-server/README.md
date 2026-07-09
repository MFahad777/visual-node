> **🤖 VIBE CODED.** This project was built end-to-end through AI-assisted ("vibe
> coding") development sessions. Review the generated code before trusting it in
> production, same as you would for any dependency.

# visual-node

Visual, node-based backend builder for Node.js. Drag-and-drop flows **compile** to real,
readable, git-friendly Express.js source — this is a codegen tool, not a runtime
interpreter. Nothing from this package ships inside the servers it generates.

Full documentation, core concepts, and guides are available at [Documentation](https://mfahad777.github.io/visual-node).

## Install & run

```bash
npx visual-node [projectDir]
# or
npm install -g visual-node
visual-node [projectDir]
```

Opens an editor at `http://localhost:4000` against `projectDir` (defaults to the current
directory). Build a flow, **Compile** it to a real Express server, **Run Server** to spawn
and hit it right there, or just read the generated files yourself.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port the editor listens on |
| `VISUAL_NODE_PROJECT_DIR` | current directory | Project directory (overridden by a CLI arg) |

## Examples

The source repository ships five worked examples under `examples/` — a minimal route, an
in-memory REST API using Variables, a custom-middleware logger, a visual Function Graph
with branching, and an npm-dependency example — each with its source flow and compiled
output committed side by side.

## What this is not

Not a runtime interpreter (no Node-RED/n8n-style flow engine ships with generated
servers), not a hosted service, and not a multi-tenant tool — it's a local, single-project
codegen editor meant to hand you real source code you keep, read, and commit.
