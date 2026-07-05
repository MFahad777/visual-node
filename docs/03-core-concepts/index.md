---
title: Core Concepts
slug: /core-concepts
---

# Core Concepts

The flow model, node categories, function graphs, and how code generation actually
works — read this before the [Node Reference](/node-reference).

- [Flows, Nodes, and Pins](/core-concepts/flows-nodes-and-pins) — nodes, edges,
  execution vs. value pins, and the legacy `"in"`/`"out"` convention.
- [Node Categories](/core-concepts/node-categories) — the 8 categories, their colors,
  and main-canvas vs. Function-Graph availability.
- [Function Graphs & Blueprint Mode](/core-concepts/function-graphs-and-blueprint-mode) —
  authoring a function as a nested visual node graph instead of hand-typed code.
- [How Code Generation Works](/core-concepts/how-codegen-works) — topological sort and
  ordering, the shared exec-chain walker, Branch/Switch scoping, and hoisting.
