---
title: Function Graphs & Blueprint Mode
---

# Function Graphs & Blueprint Mode

A `logic.function` node (see the [Logic section of the Node
Reference](/node-reference/logic)) can be authored two ways, toggled by its `mode`
config field:

- **`"code"`** (the default) — you hand-type the function body directly into the node's
  config panel, exactly like writing a normal JavaScript function.
- **`"blueprint"`** — the function body is instead an entirely separate, nested **visual
  node graph**, opened via the node's "Open Blueprint Graph" button. You wire nodes
  together on this second canvas exactly like the main canvas, and it compiles
  one-directionally into the function's body.

## The nested graph's own entry and exit

A function's blueprint graph has its own entry/exit concept, distinct from the main
canvas's `express.init`/routes:

- **`logic.graphEntry`** ("Start") — the graph's sole entry point: one execution output
  to kick off the first node in the chain, plus one **dynamic value output pin per
  current function parameter**. You never add this manually — it's managed by the
  Function Graph editor's always-visible "Function Details" panel (add/rename/remove
  parameters live, no reopening required). Renaming a parameter there relabels any wires
  already connected to it, so wiring survives a rename.
- **`logic.graphReturn`** ("Return") — ends the graph. If its "Value" input is wired, the
  compiled function ends with `return <expr>;`; left unwired, the function simply falls
  off the end with no return. At most one per graph.

Both of these node types exist **only** inside a Function Graph — they're hidden from the
main canvas's node picker entirely, since the main canvas already has its own structural
entry points (`express.init`, `logic.begin`).

## Everything else works exactly like the main canvas

Inside a blueprint-mode function's graph you can use `logic.functionCall`,
`variable.get`/`variable.set` (with their own graph-scoped variable list — never
cross-checked against the main canvas's variables), `debug.consoleLog`,
`handler.customCode` (as a generic escape-hatch statement, not just for Express
handlers), all 17 operator nodes, and `controlFlow.branch`/`controlFlow.switch` for
real branching. See [Node Categories](/core-concepts/node-categories) for the full
main-canvas/Function-Graph availability breakdown.

## A worked example

[`04-function-graph-branch`](/examples/function-graph-branch) is a complete `isEven`
function authored entirely in blueprint mode: `Start` → `Branch` (condition
`n % 2 === 0`) → each arm sets a function-scoped variable to `true`/`false` → a
`Get Variable` node feeds `Return`. Reading the result back out through a variable
(rather than returning directly from inside each Branch arm) is deliberate — see
[How Code Generation Works](/core-concepts/how-codegen-works) for why a Branch/Switch
arm's own locally-computed values can't be read directly by a downstream node outside
that arm.
