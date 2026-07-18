---
title: Overview
slug: /variables
---

# Variables

A **variable** is a named piece of state you declare once — via the **Variables** panel
shown in the right-hand sidebar whenever no node is selected (and again, independently,
inside every [Function Graph](/core-concepts/function-graphs-and-blueprint-mode)'s own
side panel) — then read and write from anywhere on that same canvas by dragging it out
onto the canvas.

Declaring one takes three things:

- **Keyword** — `const`, `let`, or `var`, exactly like hand-written JavaScript.
- **Data type** — one of 15 types (table below), which controls both what the default
  value looks like and what color the variable's pins/wires render in.
- **Default value** *(optional)* — the starting value, formatted according to the data
  type. Leaving it empty means "no initializer" for `let`/`var`, or "no top-level
  declaration at all" for a `const` (see each type's page for what that implies).

Dragging a declared variable's row (by its **⠿** handle) onto the canvas opens a small
popup offering **Get `<name>`** or **Set `<name>`**:

- **[Get Variable](/node-reference/logic/get-variable)** (`variable.get`) — a pure,
  value-producing node with one output pin, resolving to the variable's bare identifier
  wherever it's wired.
- **[Set Variable](/node-reference/logic/set-variable)** (`variable.set`) — an
  execution-passthrough node with one value input, assigning a new value and continuing
  to the next node. An unwired value is typed directly on the pin as a literal,
  formatted for the bound variable's data type the same way the default-value field is.

Both nodes are bound to one specific variable **at creation time** — that's why their
own config panels are empty; the type-specific behavior described on each page below
comes entirely from which variable they're bound to, not from anything set on the node
itself.

## The 15 data types

Each type gets its own page below: what its default-value text means, the exact JS
literal it compiles to, and a live preview of both the Get and Set node bound to a
variable of that type.

| Type | Compiles to | Page |
| --- | --- | --- |
| String | `"text"` (`JSON.stringify`-ed) | [String](/variables/string) |
| Number | a bare numeric literal | [Number](/variables/number) |
| Boolean | `true` / `false` | [Boolean](/variables/boolean) |
| Object | raw JSON object text, emitted as-is | [Object](/variables/object) |
| Array | raw JSON array text, emitted as-is | [Array](/variables/array) |
| Map | `new Map([...])` | [Map](/variables/map) |
| Set | `new Set([...])` | [Set](/variables/set) |
| WeakSet | `new WeakSet([...])` | [WeakSet](/variables/weakset) |
| BigInt | `123n` | [BigInt](/variables/bigint) |
| Symbol | `Symbol("description")` | [Symbol](/variables/symbol) |
| Buffer | `Buffer.from("text")` | [Buffer](/variables/buffer) |
| URL | `new URL("https://...")` | [URL](/variables/url) |
| Error | `new Error("message")` | [Error](/variables/error) |
| Null | the literal `null` | [Null](/variables/null) |
| Undefined | the literal `undefined` | [Undefined](/variables/undefined) |

Each type's color above (used for its Get/Set pins and outgoing wires on the canvas) is
defined once in `variableTypeTheme.ts` and never duplicated — it's the same
Unreal-Engine-Blueprint-inspired per-type palette shown in the live previews below.

## Beyond a single canvas

A few things build on top of a plain declared variable, each documented in full where
they already live rather than repeated here:

- **[Export](/node-reference/logic/export)** — wire a **Get Variable** node into an
  Export node's "Variables" pin to add it to that file's `module.exports`. A `const`
  with no default value can't be exported (see that page for why).
- **[Module Variables inside Function Graphs](/core-concepts/function-graphs-and-blueprint-mode#local-variables-and-module-variables)**
  — every Function/Handler Function graph has its own independent variable list, but
  can also read and write the main canvas's variables through a second "Module
  Variables" panel shown right alongside its local one.
- **[Get Variable](/node-reference/logic/get-variable)** /
  **[Set Variable](/node-reference/logic/set-variable)** node reference pages — the
  generic pin/config documentation for both nodes, independent of which data type they
  happen to be bound to.
