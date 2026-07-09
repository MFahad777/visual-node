---
title: Overview
slug: /node-reference
---

# Node Reference

Every built-in node type, grouped by category, with its ports, config fields, and a
worked example. See [Node Categories](/core-concepts/node-categories) for the color
legend and main-canvas vs. Function-Graph availability rules referenced throughout.

| Category | Nodes |
| --- | --- |
| [Server](/node-reference/server) | `express.init`, `express.listen` |
| [Routing](/node-reference/routing) | `express.route` |
| [Middleware](/node-reference/middleware) | `express.middleware.jsonParser`, `middleware.customCode` |
| [Handler](/node-reference/handler) | `handler.sendJson`, `handler.customCode` |
| [Operators](/node-reference/operators) | 17 arithmetic/comparison/boolean nodes |
| [Control Flow](/node-reference/control-flow) | `controlFlow.branch`, `controlFlow.switch`, `controlFlow.sequence` |
| [Logic](/node-reference/logic) | `logic.function`, `logic.export`, `logic.require`, `logic.functionCall`, `logic.callback`, `logic.pathExtractor`, `logic.graphEntry`, `logic.graphReturn`, `logic.begin`, `variable.get`, `variable.set` |
| [Array](/node-reference/array) | 9 loop-container nodes (map, filter, reduce, forEach, flatMap, find, findIndex, every, some) + 6 pass-through nodes (push, pop, unshift, shift, includes, indexOf) |
| [Debugging](/node-reference/debugging) | `debug.consoleLog` |

Looking to add a node type of your own without touching visual-node's source? See
[Plugins](/plugins).
