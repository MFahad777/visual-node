---
title: How Code Generation Works
---

# How Code Generation Works

This page is a tour of the compiler's actual behavior — useful once you start combining
Branch/Switch, operators, and multi-file projects, where "just follow the wires" stops
being the whole story.

## Structural nodes are topologically sorted

`server`, `routing`, and `middleware` category nodes (plus a handful of unconditionally
top-level `logic` nodes — `logic.function`, `logic.export`, `logic.require`,
`logic.begin`) are topologically sorted, then emitted with a stable ordering hint per
node type so the output reads the way a human would write it by hand:

| Fragment | Order |
| --- | --- |
| `express.init` | 0 |
| Variable declarations | 1 |
| `logic.begin` | 2 |
| `logic.function` | 5 |
| `express.middleware.jsonParser` / `middleware.customCode` | 10 |
| `express.route` | 20 |
| `logic.export` | 90 |
| `express.listen` | always last, 100 |

Fragments with equal order preserve dependency-correct order via a stable sort — you'll
never see `express.listen` land before a route, no matter how the nodes are wired.

## Handler chains: one exec-chain walker for both Routes and Functions

Everything wired off a Route's "Handler" output, or a Function's body, is walked by a
single shared exec-chain compiler. It handles:

- **Linear chains** — the common case: Console Log → Custom Code → Send JSON, walked in
  wire order and assembled into one function body.
- **Branch/Switch forks** — `controlFlow.branch`/`controlFlow.switch` don't emit their
  own code at all; the exec-chain walker special-cases them directly, compiling each
  wired arm as its **own independent scope** (a real `if`/`else` block or `switch` case).
  This is why a value computed *inside* one Branch arm can't be read by a node outside
  that arm, or by a sibling arm — it's out of scope, exactly like in hand-written
  JavaScript. **Reconvergence is fine**: if both arms wire back to the same downstream
  node, that node's code is simply emitted once per arm (safe, since only one arm ever
  executes per request).
- **Hoisting pure value dependencies** — a pure value node (an operator, a Get Variable)
  referenced from the middle of a chain is automatically hoisted to just before it's
  needed, even if nothing wired it in at the top level. This is also what lets an
  operator's result reach a Branch that's shared across two arms without duplicating the
  computation incorrectly — each arm gets its own hoisted copy, so there's no cross-arm
  leakage.
- **`await`/async** — a node can declare that it needs `await` (an async plugin, for
  instance). If the compiled chain needs it but the owning Route/Function/Middleware's
  "Async Handler" checkbox isn't enabled, compiling fails with a clear error rather than
  emitting invalid JavaScript.

## `imports` vs. `setup` vs. `body`

Every node's `emit()` can return three kinds of code:

- **`imports`** — `require(...)` lines. Always safe to hoist to the top of the file
  regardless of nesting depth, since a `require` never references per-request wiring.
  Every exec-chain consumer bubbles these up from every node it visits, no matter how
  deeply nested inside a Branch arm.
- **`setup`** — a top-level statement (a function declaration, `module.exports`, a
  variable declaration). Never bubbled across scopes — it means what it says, "goes here
  at the top level."
- **`body`** — a fragment that belongs inside whatever handler/function currently owns
  this node's position in the chain.

## Multi-file projects compile together

"Compile" walks **every** `.blueprint` file in the project at once, not just the open
one — this is what makes cross-file `require()` (`logic.require` with source type
"Local") resolve correctly. See [Project Directory](/configuration/project-directory).
