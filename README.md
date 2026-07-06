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

- **Change-1 (MINOR)** — Function Graphs: functions can now call themselves or other
  functions declared in the same file directly, without a Require node. Inside a
  Function's blueprint graph, adding a "Function Call" now shows a "Functions in This
  File" section listing every function in the current file, including the function's
  own entry (labeled "(recursive)") — enabling real recursion authored visually, e.g. a
  factorial function that calls itself. The existing Require-based Function Call flow,
  used to call functions exported from other files, is unaffected.
- **Change-2 (MINOR)** — Project Settings: a new Settings tab lets you declare how your
  project runs — **Server mode** (default; runs the compiled file containing your
  `express.listen` node, same as before) or **Script mode** (runs any compiled
  `.blueprint` file directly, even one with no server code at all — useful for plain
  logic/helper scripts). The Run button's label and behavior follow whichever mode is
  selected. Settings are saved to `visual-node-project-settings.json` at your project
  root. Existing projects default to auto-detected Server mode with no changes needed.
- **Change-3 (MINOR)** — Operators: "Equal" and "Not Equal" nodes gained a "Strict"
  checkbox in their config panel (on by default). Turn it off to use JavaScript's loose
  comparison (`==`/`!=`, with type coercion) instead of strict comparison (`===`/`!==`).
  Other comparison nodes (Greater Than, Less Than, Greater Or Equal, Less Or Equal) are
  unchanged — JavaScript has no loose variant for those, so they keep their existing
  single behavior with no new config field.