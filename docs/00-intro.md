---
slug: /
title: Introduction
---

# visual-node

visual-node is a visual, node-based backend builder for Node.js. You drag nodes onto a
canvas, wire them together, and hit **Compile** — the tool **generates real, readable,
git-friendly Express.js source code** from your flow.

:::info What this is not
visual-node is a **codegen tool**, not a runtime interpreter like Node-RED or n8n. Nothing
from it ships inside the servers it generates — the output is plain CommonJS
Express code with a normal `package.json`, meant to be read, committed, and hand-edited
by a developer afterward, not hidden behind the tool forever. It's also a local,
single-project editor, not a hosted or multi-tenant service.
:::

## How it works

A **flow** is a graph of nodes (`express.init`, `express.route`, `handler.sendJson`,
`logic.function`, custom-code escape hatches, and more — see the [Node
Reference](/node-reference)) connected by wires representing either **execution order**
or **data**. Compiling walks that graph and emits plain CommonJS Express source into your
project directory.

Your flows are saved as `.blueprint` files that live alongside the generated code in a
normal, committable project folder — there's no hidden project format and no server-side
state beyond what's on disk. A project can span multiple `.blueprint` files: write
reusable functions in one file, export the ones you want to share, and `require()` them
from another — see [Configuration](/configuration/project-directory) and the [Node
Reference's Logic section](/node-reference/logic) for `logic.export`/`logic.require`.

## What you get out of the box

- **The full Express request lifecycle, visually**: app initialization, middleware
  (built-in JSON body parsing or your own custom middleware), routing, and handlers.
  Or run plain logic files without Express — switch modes in **Settings**.
- **An escape hatch everywhere you need one**: `handler.customCode` and
  `middleware.customCode` let you drop in raw JavaScript wherever the visual nodes don't
  cover your case — see the [Node Reference](/node-reference) for both.
- **Programming primitives**: named variables, functions (either hand-typed or authored
  as a nested visual graph with recursion support — see [Function Graphs & Blueprint
  Mode](/core-concepts/function-graphs-and-blueprint-mode)), arithmetic/comparison/boolean
  operators, and control flow (`Branch`, `Switch`, `Sequence`).
- **npm package support**: `require()` an installed package, or your own local module.
- **A plugin system**: describe an entirely new node type as a single JSON file — no
  TypeScript, no rebuild, no restart. See [Plugins](/plugins).
- **Project execution modes**: configure whether your project runs as an Express server
  (auto-detected or manually configured) or as a plain Node.js script.

## Where to go next

- [Getting Started](/getting-started) — install visual-node and compile your first flow.
- [Configuration](/configuration/environment-variables) — environment variables and how
  the project directory is resolved.
- [Core Concepts](/core-concepts/flows-nodes-and-pins) — the flow model: nodes, edges,
  execution vs. value pins, and how code generation actually works.
- [Node Reference](/node-reference) — every built-in node type, with its ports, config
  fields, and a worked example.
- [Plugins](/plugins) — write your own node types.
- [Examples](/examples) — five complete, runnable worked flows.
