---
title: Logic
---

# Logic nodes

The most heterogeneous category: declaring and calling functions, requiring modules,
module-load-time setup, and reading/writing named variables.

## Function — `logic.function`

Declares a named JavaScript function at the top level of the current file.

- **Inputs**: none
- **Outputs**: `out` — "Function"
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | text | `myFunction` | Must be a valid JS identifier. Also the property name seen on the imported module if exported. |
| `params` | text | `""` | Comma-separated parameter names, e.g. `"date, format"`. Blank for no parameters. |
| `mode` | select | `code` | `"code"` uses the Function Body field below; `"blueprint"` compiles this function from a nested node graph instead — see [Function Graphs & Blueprint Mode](/core-concepts/function-graphs-and-blueprint-mode). |
| `body` | code | `""` | Only used in `"code"` mode. Available: the declared parameter names. Use `return` to produce a value. |
| `isAsync` | boolean | `false` | Enable to use `await` inside this function's body. |
| `npmDependencies` | text | `""` | Comma-separated npm packages (code mode only). |

Multiple Function nodes are expected in one file, each named and configured
independently. A Function left unconnected to an Export node just stays a private,
still-emitted helper within that file.

```js
function formatDate(date) {
  return date.toISOString();
}
```

## Export — `logic.export`

Marks which Function node(s) in this file are exported.

- **Inputs**: `in` — "Functions" — accepts **multiple** incoming edges, one per exported
  function
- **Outputs**: none
- **Config fields**: none
- **Constraints**: every incoming wire's source must be a Function node; **at most one**
  Export node per file.

```js
module.exports = { formatDate, otherHelper };
```

## Require — `logic.require`

Imports another blueprint file's exports, or an installed npm package, exactly like
Node's own `require()`.

- **Inputs / Outputs**: none — it's a pure declaration, referenced elsewhere by the bare
  variable name you give it, not by wiring.
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `sourceType` | select | `local` | `"local"` or `"npm"`. |
| `path` | text | `""` | Local: relative path without extension, e.g. `"../helpers/dateFormatter"`. npm: package name, e.g. `"axios"` or `"@org/pkg"`. |
| `variableName` | text | `""` | Must be a valid, unique JS identifier. |
| `version` | text | `""` | npm mode only, e.g. `"^1.7.0"`. Blank means unpinned. |

```js
// Local
const dateHelper = require("../helpers/dateFormatter");

// npm
const axios = require("axios");
```

## Function Call — `logic.functionCall`

Calls an exported function from a Required module. Always created **pre-filled** from
the node search (pick a specific exported function) rather than configured from a blank
default.

- **Inputs**: `in` — "Request", plus one dynamic value pin per declared parameter
- **Outputs**: `out` — "Next"; `result` — "Result" (optional — see below)
- **Config fields**: `requirePath`, `variableName`, `functionName`, `params` (drives the
  dynamic parameter pins), `resultVariable` (default `result`, must be a valid unique
  identifier — other nodes reference this call's return value by this name).
- The "Result" output is **optional**: if nothing reads it, the call compiles to a bare
  `fn(...)` statement with no unused `const`.
- **Inlining**: if Result is wired straight into an adjacent `variable.set` node's Value
  pin (and nothing else consumes it), the call is inlined directly into the assignment
  instead of going through an intermediate variable.

```js
// Result unwired — fire-and-forget
printerFunctions.printer("hello");

// Result wired into an adjacent Set Variable — inlined
printResult = printerFunctions.printer("hello");

// Result wired elsewhere — a real intermediate declaration
const printerResult = printerFunctions.printer("hello");
```

Usable both on the main canvas and inside a Function Graph.

## Start & Return — `logic.graphEntry` / `logic.graphReturn`

**Function Graph only** — see [Function Graphs & Blueprint
Mode](/core-concepts/function-graphs-and-blueprint-mode) for the full picture. Never
added manually.

- **`logic.graphEntry`** ("Start"): no inputs; a static `out` exec output plus one
  dynamic value output per current function parameter, managed by the Function Graph
  editor's own panel.
- **`logic.graphReturn`** ("Return"): a `value` input; ends the graph with
  `return <expr>;` if wired, or falls off the end with no return if not. At most one per
  graph.

## Begin — `logic.begin`

Runs once when this file is loaded, before any request comes in — the visual equivalent
of top-of-file setup code.

- **Inputs**: none (always a root of its own exec chain)
- **Outputs**: `out` (exec) — "Then"
- **Config fields**: none
- **Constraints**: at most one per flow; an unwired Begin is a harmless no-op, not an
  error.

Category is deliberately **Logic**, not **Server** — a pure-logic helper file (functions
and exports only, no routes) can use a Begin node for setup without being forced to also
add an unrelated `express.init`.

```js
let counter = 0;
counter = 1;

const DIR = "/srv/app";

app.get("/hello", (req, res) => {
  // ...
});
```

If the chain wired to Begin needs `await`, it's automatically wrapped in a fire-and-forget
async IIFE — there's no "Async" checkbox on Begin itself:

```js
(async () => {
  await Promise.resolve();
})();
```

## Get Variable — `variable.get`

Reads the current value of a declared variable. Bound to a specific variable at creation
time (dragged from the Variables panel) — its config panel is intentionally empty.

- **Inputs**: none
- **Outputs**: `value` (value) — "Value"
- **Config fields**: none

Pure, value-producing, no execution pins — resolves to the variable's bare identifier
wherever it's wired. Usable both on the main canvas and inside a Function Graph, each
scope's variables kept fully independent.

## Set Variable — `variable.set`

Assigns a new value to a declared variable, then continues to the next node.

- **Inputs**: `in` (exec) — "Exec"; `value` (value) — "Value"
- **Outputs**: `out` (exec) — "Next"
- **Config fields**: none (same variable-bound-at-creation model as Get Variable; the
  Value pin's literal editor lives on the pin itself)

An unwired literal is formatted according to the variable's declared data type (a string
variable gets `JSON.stringify`-ed, a Map/Set/WeakSet variable gets wrapped in
`new Map(...)`/`new Set(...)`/`new WeakSet(...)`, and so on) — a *wired* value is never
reformatted, since it's already a proper expression.

```js
// let target
counter = 1;

// const target — always its own scoped redeclaration, since const can't be reassigned
const counter = 1;
```

Usable both on the main canvas and inside a Function Graph.
