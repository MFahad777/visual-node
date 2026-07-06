---
title: Node Categories
---

# Node Categories

Every node type belongs to exactly one of 8 categories. A node's category determines its
header color/icon on the canvas and which group it appears under in the node picker —
this is also how the [Node Reference](/node-reference) is organized.

| Category | Color | What it's for |
| --- | --- | --- |
| **Server** | slate | Creating and starting the Express app (`express.init`, `express.listen`). |
| **Routing** | blue | Defining HTTP routes (`express.route`). |
| **Middleware** | amber | Request-processing middleware, built-in or custom (`app.use(...)`). |
| **Handler** | emerald | Terminal request handlers — the end of a route's chain. |
| **Operators** | cyan | Pure, value-producing arithmetic/comparison/boolean nodes — no execution pins. |
| **Control Flow** | lime | Directing execution: `Branch` (if/else), `Switch`, and `Sequence` (run every wired output, in order). |
| **Logic** | violet | Functions, variables, requiring modules, and module-load-time setup. |
| **Debugging** | rose | `Console Log`. |

This is the exact order the [Node Reference](/node-reference) presents them in, and the
same order/colors you'll see in the editor's own category legend and node picker.

## Availability: main canvas vs. Function Graphs

A Function node can be authored either as hand-typed code or as its own nested visual
node graph ("blueprint mode" — see [Function Graphs & Blueprint
Mode](/core-concepts/function-graphs-and-blueprint-mode)). Not every node type is
available in both places:

- **Main canvas only**: `express.init`, `express.listen`, `express.middleware.jsonParser`,
  `middleware.customCode`, `express.route`, `handler.sendJson`, `logic.function`,
  `logic.export`, `logic.require`, `logic.begin`.
- **Function Graph only**: `logic.graphEntry` (the graph's entry point, never added
  manually — managed via the Function Graph editor's own panel) and `logic.graphReturn`
  (ends the chain it's wired into with a return value; any number allowed, added from the
  picker like any other node).
- **Both, full parity**: `logic.functionCall`, `variable.get`, `variable.set`,
  `debug.consoleLog`, `handler.customCode`, all 17 `operators.*` nodes, and all three
  `controlFlow.*` nodes (`branch`, `switch`, `sequence`).

Each node's page in the [Node Reference](/node-reference) notes which of these applies.
