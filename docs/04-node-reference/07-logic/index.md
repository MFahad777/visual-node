---
title: Logic
slug: /node-reference/logic
---

# Logic nodes

The most heterogeneous category: declaring and calling functions, requiring modules,
module-load-time setup, and reading/writing named variables. See [Node
Categories](/core-concepts/node-categories) for the color legend and main-canvas vs.
Function-Graph availability rules.

| Node | Type | What it does |
| --- | --- | --- |
| [Function](/node-reference/logic/function) | `logic.function` | Declares a named JavaScript function at the top level of the current file. |
| [Handler Function](/node-reference/logic/handler-function) | `logic.handlerFunction` | Declares a named Express request handler with fixed `req`, `res`, `next` parameters — the node every route needs at least one of. |
| [Export](/node-reference/logic/export) | `logic.export` | Marks which Function node(s) and/or variable(s) in this file are exported. |
| [Require](/node-reference/logic/require) | `logic.require` | Imports another blueprint file's exports, or an installed npm package, exactly like Node's own `require()`. |
| [Function Call](/node-reference/logic/function-call) | `logic.functionCall` | Calls an exported function from a Required module, or a sibling function in the same file, including recursion. |
| [Callback](/node-reference/logic/callback) | `logic.callback` | Calls a wired-in function *reference* with however many arguments you give it. |
| [Path Extractor](/node-reference/logic/path-extractor) | `logic.pathExtractor` | Resolves a free-form dot/bracket property path against a wired object, calling it if the resolved value is a function. |
| [Promise](/node-reference/logic/promise) | `logic.promise` | Constructs and handles a JavaScript `Promise`, awaited inline or handled via Then/Catch execution arms. |
| [Start](/node-reference/logic/start) | `logic.graphEntry` | Function Graph only — the graph's entry point, never added manually. |
| [Return](/node-reference/logic/return) | `logic.graphReturn` | Ends the chain it's wired into, optionally as a real early return from inside a Branch/Switch arm. |
| [Begin](/node-reference/logic/begin) | `logic.begin` | Runs once when this file is loaded, before any request comes in. |
| [Get Variable](/node-reference/logic/get-variable) | `variable.get` | Reads the current value of a declared variable. |
| [Set Variable](/node-reference/logic/set-variable) | `variable.set` | Assigns a new value to a declared variable, then continues to the next node. |
