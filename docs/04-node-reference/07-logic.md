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

Marks which Function node(s) and/or variable(s) in this file are exported.

- **Inputs**: `in` — "Functions" — accepts **multiple** incoming edges, one per exported
  function; `variables` (value) — "Variables" — accepts **multiple** incoming edges, one
  per exported variable, wired from `variable.get` nodes
- **Outputs**: none
- **Config fields**: none
- **Constraints**: every "Functions" wire's source must be a Function node; every
  "Variables" wire's source must be a `variable.get` node bound to a variable that is
  **not** a `const` with no default value (see Notes below); the same function or
  variable may not be wired into Export more than once; **at most one** Export node per
  file.

```js
module.exports = { formatDate, otherHelper, appVersion };
```

### Why a bare `const` with no default can't be exported

`emit-express.ts` only unconditionally emits a top-level (module-scope) declaration for
`let`/`var` variables and for `const` variables that already have a default value. A
`const` with no default has no such guarantee — its only declaration point is wherever
its `variable.set` node's execution chain happens to land, which could be nested inside a
route handler or a Branch/Switch arm, or never emitted at all if unreachable. Exporting
such a variable could reference an undeclared identifier or the wrong scoped binding, so
it's rejected at validation time instead of silently compiling broken output.

Reading an exported variable from another file needs no special mechanism — it works via
`requireVarName.exportedName` inside any raw-code field (Custom Code, Expression, Path
Extractor's object pin, etc.), the same way any exported function property not wrapped in
a `logic.functionCall` is already consumed.

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

Calls an exported function from a Required module, or calls a sibling function declared
in the same file (including recursive calls). Always created **pre-filled** from
the node search (pick a specific exported function or same-file function) rather than
configured from a blank default.

- **Inputs**: `in` — "Request", plus one dynamic value pin per declared parameter
- **Outputs**: `out` — "Next"; `result` — "Result" (optional — see below)
- **Config fields**: 
  - For external functions: `requirePath`, `variableName`, `functionName`, `params`
  - For same-file functions: `functionName`, `params` (requirePath/variableName unused)
  - Both: `resultVariable` (default `result`, must be a valid unique identifier — other
    nodes reference this call's return value by this name)
- The "Result" output is **optional**: if nothing reads it, the call compiles to a bare
  `fn(...)` statement with no unused `const`.
- **Inlining**: if Result is wired straight into an adjacent `variable.set` node's Value
  pin (and nothing else consumes it), the call is inlined directly into the assignment
  instead of going through an intermediate variable.
- **Recursion**: Inside a Function Graph, you can add a Function Call that references the
  same function whose graph you're editing — the picker labels it "(recursive)". The call
  compiles to the bare function name (no module prefix), enabling true recursive logic.

```js
// Result unwired — fire-and-forget
printerFunctions.printer("hello");

// Result wired into an adjacent Set Variable — inlined
printResult = printerFunctions.printer("hello");

// Result wired elsewhere — a real intermediate declaration
const printerResult = printerFunctions.printer("hello");

// Recursive call in a Function Graph (inside a factorial function)
const remainder = factorial(n - 1);
const answer = n * remainder;
return answer;
```

Usable both on the main canvas and inside a Function Graph.

## Path Extractor — `logic.pathExtractor`

Resolves a free-form dot/bracket property path (e.g. `store.getInvoice`,
`items[0].name`) against a wired object. If the resolved value is a function, it's
called via `.apply(parent, args)` — preserving the correct `this` binding — with
arguments gathered from dynamically-added parameter pins. A non-function resolved value
is returned as-is, ignoring any parameters.

- **Inputs**: `in` (exec) — "In"; `data_object` (value) — "Object" (wire-only, no
  inline literal); plus dynamic `param-0..N` value pins, each with inline free-form
  literal editing
- **Outputs**: `out` (exec) — "Next"; `data_value` (value) — "Result"
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | text | `""` | Free-form dot/bracket property path, e.g. `"billing.currency"` or `"items[0].name"`. |

Grow or shrink the parameter pins with the **"+ Add Param"** / **"- Remove Param"**
buttons rendered directly on the node face. Unlike other dynamic-pin node types
(variadic boolean operators, Sequence, Switch), removal always targets the
**highest-index** pin, never a pin in the middle of the list.

```js
// path: "store.getInvoice", param-0 wired to an Invoice ID value
const result = store.getInvoice.apply(store, [invoiceId]);

// path: "items[0].name" — plain property access, no params
const result = items[0]?.name;
```

Path splitting into segments happens once at compile time. Resolving everything *except*
the final segment goes through the `lodash.get` npm package at runtime — but only when
the parent path actually needs it: an empty parent path aliases straight to the object,
and a single-segment parent without brackets compiles to a plain optional-chained
property access, avoiding the `lodash.get` dependency entirely for the common cases.
Only a multi-segment parent path (dots or brackets) pulls in `lodash.get`, since a
null-safe walk of arbitrary depth is what it's for.

## Start — `logic.graphEntry`

**Function Graph only** — see [Function Graphs & Blueprint
Mode](/core-concepts/function-graphs-and-blueprint-mode) for the full picture. Never
added manually.

- **`logic.graphEntry`** ("Start"): no inputs; a static `out` exec output plus one
  dynamic value output per current function parameter, managed by the Function Graph
  editor's own panel.

## Return — `logic.graphReturn`

**Function Graph only** — see [Function Graphs & Blueprint
Mode](/core-concepts/function-graphs-and-blueprint-mode) for the full picture.

- **Inputs**: `in` (exec) — "In"; `value` (value) — "Value"
- **Outputs**: none — Return ends the chain it's wired into.

Unlike Start, **any number of Return instances are allowed per graph**, and each one is an
ordinary node addable from the picker just like Branch/Switch — there's no singleton panel
managing it. Each instance has its own execution-in pin:

- If a Return's exec-in **is** wired (e.g. from inside a Branch/Switch arm), it emits its
  `return <expr>;` **in place**, right where it's wired — a real early return.
- A Return with **no** exec-in wire falls back to the pre-existing trunk-trailing
  behavior: its `return <expr>;` is appended once after the whole compiled function body.
  This is the only shape Return could take before it gained an exec-in pin, so every
  pre-existing `.blueprint` file with a single unwired Return keeps compiling identically.

If "Value" is unwired, the returned Return falls off with no return value emitted for
that arm; the Value pin also supports typing a literal directly on the pin, the same as
any other value input.

```js
// Two Return instances, each wired from inside its own Branch arm — real early returns
if (score >= 90) {
  return "A";
} else {
  if (score >= 80) {
    return "B";
  } else {
    return "C";
  }
}
```

See [Function Graphs & Blueprint Mode](/core-concepts/function-graphs-and-blueprint-mode)
for a worked early-return example.

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
time (dragged from the Variables panel — grab the row by its **⠿** drag handle, not the
name/type fields, which are separately editable) — its config panel is intentionally
empty.

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
