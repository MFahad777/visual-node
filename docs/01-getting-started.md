---
title: Getting Started
---

# Getting Started

## Install & run

```bash
npx visual-node [projectDir]
```

or install it globally:

```bash
npm install -g visual-node
visual-node [projectDir]
```

This opens the editor at `http://localhost:4000` against `projectDir` (defaults to the
current directory). If `projectDir` doesn't exist yet, it's created for you.

## The compile / run cycle

1. **Build a flow** on the canvas — right-click to search for a node, or open **Browse
   Nodes** in the toolbar for a searchable catalog of every built-in node type (see the
   [Node Reference](/node-reference)).
2. Hit **Compile** to generate code from the flow. For a multi-file project,
   Compile walks every `.blueprint` file at once (not just the one you have open), so
   cross-file `require()`s between them resolve correctly.
3. **Run** your code using the Run button in the toolbar:
   - **Server mode** (default): Button reads "Run Server"; compiles and spawns an Express
     server as a real child process. Configure which `.blueprint` file is your entry point
     via **Settings** in the toolbar (or leave blank to auto-detect via `express.listen`
     node scan). See logs streamed live in the editor; **Stop Server** kills it.
   - **Script mode**: Button reads `Run <filename>.js` (dynamic based on the currently open
     file). Useful for running plain logic files (functions, helpers) without an Express
     server. Switch modes in **Settings**.
4. Or skip the built-in runner entirely — the generated files are plain `.js`, so you can
   `cd` into the project directory yourself and run `node server.js` (or any `.js` file)
   after `npm install` in that directory, if the flow declares any npm dependencies.

Everything visual-node writes — the `.blueprint` source files and the generated `.js`
output — lives in your project directory as normal, committable files. There's no
separate database or hidden state.

## Where to go next

- [Configuration](/configuration/environment-variables) — env vars and how the project
  directory is resolved.
- [Core Concepts](/core-concepts/flows-nodes-and-pins) — understand the flow model before
  diving into the Node Reference.
- [Examples](/examples) — five complete, runnable worked flows, from a minimal "Hello
  World" route up through Variables, visual Function Graphs with branching, and
  npm-package dependencies.
