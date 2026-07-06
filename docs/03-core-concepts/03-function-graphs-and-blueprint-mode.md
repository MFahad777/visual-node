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
- **`logic.graphReturn`** ("Return") — ends the chain it's wired into with
  `return <expr>;`. Unlike Start, **any number of Return instances are allowed**, each an
  ordinary node added from the picker (like Branch/Switch) rather than a managed
  singleton, and each with its own execution-in pin: wire one from inside a Branch/Switch
  arm to return early, right there, without running the rest of the graph. A Return left
  with its execution-in pin unwired falls back to the original behavior — its value is
  appended once after the whole compiled function body — so a graph authored before
  Return had an exec pin keeps compiling identically.

Both of these node types exist **only** inside a Function Graph — they're hidden from the
main canvas's node picker entirely, since the main canvas already has its own structural
entry points (`express.init`, `logic.begin`).

### Early returns

Wiring a Return's execution-in pin from inside a Branch (or Switch) arm makes that arm's
`return` a real early return, letting the rest of the graph run only when no earlier arm
returned — the visual equivalent of an `if`/`else if` grading chain:

```js
function grade(score) {
  if (score >= 90) {
    return "A"; // Return #1, wired from this Branch's True arm
  } else {
    if (score >= 80) {
      return "B"; // Return #2, wired from the nested Branch's True arm
    } else {
      return "C"; // Return #3, wired from the nested Branch's False arm
    }
  }
}
```

This is a second, more direct pattern than the read-a-value-back-through-a-variable
workaround below — reach for a Return-per-arm when each arm's outcome really is "done,
return this," and for the variable workaround when an arm needs to hand a value to
sibling logic that keeps running afterward.

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
