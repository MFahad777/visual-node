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
| **Logic** | violet | Functions, variables, requiring modules, property-path extraction, and module-load-time setup. |
| **Array** | light grey | Array iteration (map, filter, reduce, etc. with wireable loop bodies) and simple methods (push, pop, includes, etc.). |
| **Error** | red | Handling thrown errors: `Try Catch` and `Throw`. |
| **Debugging** | rose | `Console Log`. |

This is the exact order the [Node Reference](/node-reference) presents them in, and the
same order/colors you'll see in the editor's own category legend and node picker.

## Availability: main canvas vs. Function Graphs

A Function node can be authored either as hand-typed code or as its own nested visual
node graph ("blueprint mode" — see [Function Graphs & Blueprint
Mode](/core-concepts/function-graphs-and-blueprint-mode)). Not every node type is
available in both places:

- **Main canvas only**: `express.init`, `express.listen`, `express.middleware.jsonParser`,
  `middleware.customCode`, `express.route`, `logic.handlerFunction`, `logic.function`,
  `logic.export`, `logic.require`, `logic.begin`.
- **Function Graph only**: `logic.graphEntry` (the graph's entry point, never added
  manually — managed via the Function Graph editor's own panel). `logic.graphReturn`
  (Return) is no longer Function-Graph-only — it's also usable directly inside an
  `array.*` loop body on the main canvas.
- **Both, full parity**: `logic.functionCall`, `logic.callback`, `logic.pathExtractor`,
  `logic.promise`, `logic.graphReturn`, `variable.get`, `variable.set`, `debug.consoleLog`,
  `handler.sendJson`, all 17 `operators.*` nodes, all three `controlFlow.*` nodes
  (`branch`, `switch`, `sequence`), all 15 `array.*` nodes, and both `error.*` nodes
  (`tryCatch`, `throw`).

One further exception: `logic.promise` can also be nested inside ANOTHER Promise node's
own Blueprint executor graph, to any depth — the only node type addable inside a nested
Blueprint sub-canvas besides the types already listed above for "Both, full parity".

Each node's page in the [Node Reference](/node-reference) notes which of these applies.
