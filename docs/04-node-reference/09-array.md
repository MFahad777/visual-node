---
title: Array
---

# Array nodes

15 node types for working with arrays: 9 **loop-container** nodes (iteration methods
with a wireable execution body, architecturally similar to
[Branch/Switch/Sequence](/node-reference/control-flow)) and 6 **simple pass-through**
nodes (single exec-in/exec-out, no forking — structurally identical to
`debug.consoleLog`).

Usable both on the main canvas and inside a [Function
Graph](/core-concepts/function-graphs-and-blueprint-mode).

## Loop-container nodes

`array.map`, `array.filter`, `array.forEach`, `array.flatMap`, `array.find`,
`array.findIndex`, `array.every`, `array.some`, `array.reduce`.

- **Inputs**: `in` (exec) — "In"; `array` (value) — "Array"
- **Outputs**: `loopBody` (exec) — "Loop Body", repeats once per element; `element`
  (value) — the current item; `index` (value) — the current iteration index; `arrayRef`
  (value) — the full array; `completed` (exec) — "Completed", continues once the loop
  finishes; `result` (value) — the method's return value, for nodes that produce one
- `array.reduce` additionally has an `accumulator` (value) output pin
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `callback` | code | `""` | Raw JS escape hatch, used **only** as a fallback if "Loop Body" is left unwired. |
| `initialValue` | text | `""` | `array.reduce` only. |

Wire an execution chain directly into "Loop Body" instead of writing a callback: context
variables (`element`, `index`, `arrayRef`, and — for reduce — `accumulator`) are exposed
as ordinary output pins you can wire into downstream nodes, and a
[Return](/node-reference/logic#return--logicgraphreturn) node inside the loop body
produces the callback's return value.

```js
// array.map with a wired Loop Body: element -> Multiply(2) -> Return
const doubled = items.map((_item_n1, _index_n1) => {
  return _item_n1 * 2;
});
```

Each wired loop body gets its own scope, exactly like a Branch/Switch arm — a value
computed inside the loop body can't be read from outside it. Per-node-unique context
identifiers (`_item_<id>`, `_index_<id>`, `_array_<id>`, `_acc_<id>`) mean loops can be
nested arbitrarily without variable shadowing. A loop body with no wired Return is valid
and simply produces `undefined` for that iteration — matching plain JavaScript
`.map()`/`.filter()`/etc. semantics; there's no penalty or validation error for e.g. a
`forEach → Console Log` loop with pure side effects.

If "Loop Body" is left entirely unwired, the node falls back to compiling the `callback`
config field as a raw inline arrow function — the only shape available before wired loop
bodies existed, so every pre-existing `.blueprint` file keeps compiling unchanged.

## Simple pass-through nodes

`array.push`, `array.pop`, `array.unshift`, `array.shift`, `array.includes`,
`array.indexOf`.

Ordinary single exec-in/exec-out nodes, no forking or loop body — identical shape to
`debug.consoleLog`.

- **Inputs**: `in` (exec) — "In"; `array` (value) — "Array"; plus one element/search-value
  input (`push`/`unshift`: "Value" to add; `includes`/`indexOf`: "Search Element") —
  supports inline literal editing when unwired
- **Outputs**: `out` (exec) — "Next"; `result` (value) — the method's return value
  (mutators: the new array/removed element per normal JS semantics; searchers:
  boolean/number)
- **Config fields**: none

```js
items.push(newItem);
const found = items.includes(searchValue);
```

`push`/`unshift` each take a **single** element per node by explicit product decision —
chain multiple nodes to add multiple elements in sequence.

## Notes

- The 9 loop-container methods replaced an earlier callback-only design; the `callback`
  field remains as a fallback so no existing project needs migration.
- `logic.graphReturn` (Return) is usable directly inside a loop body on the **main
  canvas**, not just inside a Function Graph — it's the mechanism that produces each
  loop body's return value.
