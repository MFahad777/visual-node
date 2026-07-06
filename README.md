> **🤖 VIBE CODED.** This project was built end-to-end through AI-assisted ("vibe
> coding") development sessions. Review the generated code before trusting it in
> production, same as you would for any dependency.

# visual-node

Visual, node-based backend builder for Node.js. Drag-and-drop flows **compile** to real,
readable, git-friendly Express.js source — this is a codegen tool, not a runtime
interpreter like Node-RED/n8n. The code it produces is meant to be read, committed, and
hand-edited afterward, not hidden behind the tool forever.

Full documentation, core concepts, and guides are available at [Documentation](https://mfahad777.github.io/visual-node).

## Quick start

```bash
npx visual-node [projectDir]
```

This opens an editor at `http://localhost:4000` against `projectDir` (defaults to the
current directory). Build a flow on the canvas, hit **Compile** to generate an Express
server from it, then **Run Server** to spawn and test it right there — or just read the
generated `.js` files and take it from there yourself.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port the editor itself listens on |
| `FLOWSERVER_PROJECT_DIR` | current directory | Project directory (overridden by a CLI arg) |

## How it works

A flow is a graph of nodes (`express.init`, `express.route`, `handler.sendJson`,
`logic.function`, custom-code escape hatches, and more) connected by wires representing
either execution order or data. Compiling walks that graph and emits plain CommonJS
Express source — no runtime dependency on this tool ships with the generated server.
`.blueprint` files (the flow's saved source of truth) live alongside your generated code
in your project directory, so the whole thing is a normal, committable folder.

See [`examples/`](examples/) for five worked flows, from a minimal "Hello World" route up
through Variables, visual Function Graphs with branching, and npm-package dependencies —
each includes the source flow, the compiled output, and a short write-up of what it
demonstrates.

## Changelog

- **Change-1 (MINOR)** — Function Graphs: the "Return" node can now be used more than once
  per function, and each instance has its own execution-in pin. This enables real early
  returns authored visually — e.g. an `if (score >= 90) return "A"; else if (...) ...`
  grading chain, or a guard clause that returns early and lets the rest of the function run
  otherwise — without dropping down to a Custom Code node. Existing projects and saved
  `.blueprint` files are unaffected and keep compiling exactly as before.
- **Change-2 (FIX)** — Function Graphs: dragging a variable from the Variables panel onto
  the canvas (to create a "Get"/"Set" node) could silently do nothing if you clicked
  anywhere on the row's own name/type fields instead of an empty sliver of padding. The row
  now has a dedicated drag handle (⠿) so grabbing it always works.
