---
title: Control Flow
---

# Control Flow nodes

Both nodes here are compiled specially: their own `emit()` functions are defensive stubs
that always throw — the real compilation happens inside the shared [exec-chain
walker](/core-concepts/how-codegen-works), since a fork into two independent downstream
sub-chains can't be expressed as a flat `{imports, setup, body}` fragment the way every
other node type's output can.

Usable both on the main canvas and inside a [Function
Graph](/core-concepts/function-graphs-and-blueprint-mode).

## Branch — `controlFlow.branch`

An "if": evaluates "Condition" and continues down either "True" or "False", never both.

- **Inputs**: `in` (exec) — "In"; `condition` (value) — "Condition"
- **Outputs**: `true` (exec) — "True"; `false` (exec) — "False"
- **Config fields**: none — the Condition literal, when unwired, is typed directly on
  the pin.
- **Constraints**: at least one of True/False must have an outgoing wire (a Branch wired
  to nothing is almost certainly a mistake); each of True/False may have **at most one**
  outgoing connection.

The exact shape of the generated `if` depends on which arms are wired:

```js
// Both True and False wired
if (n % 2 === 0) {
  // ...True arm
} else {
  // ...False arm
}

// Only True wired — no else; a false condition falls through with no effect
if (n % 2 === 0) {
  // ...True arm
}

// Only False wired — the condition is inverted, not left as an empty positive branch
if (!(n % 2 === 0)) {
  // ...False arm
}
```

A value computed *inside* one arm is scoped to that arm's own `{ }` block — a sibling arm
or a downstream node outside the Branch can't read it directly, exactly like hand-written
JavaScript. See the [Function Graph & Blueprint Mode
example](/core-concepts/function-graphs-and-blueprint-mode) for the usual workaround
(write the result to a variable inside each arm, then read the variable back out
afterward) and [How Code Generation Works](/core-concepts/how-codegen-works) for why.

## Switch — `controlFlow.switch`

Routes execution to the output matching "Selection", or "Default" if nothing matches.
Despite an internal "Switch on Int" label, Selection accepts **any** primitive type —
number, string, or boolean.

- **Inputs**: `in` (exec) — "In"; `selection` (value) — "Selection", any type
- **Outputs**: `default` (exec) — "Default", plus one dynamic `case-<id>` exec output
  per entry in the node's **Cases** list (edited in the side panel — add/remove/edit
  case values there, not by adding pins on canvas)
- **Config fields**: none — case values live in the Cases list; Selection's unwired
  literal is typed directly on the pin.
- **Constraints**: case values must be unique; at least one case's or Default's output
  must be wired; Default may have **at most one** outgoing connection.

```js
switch (status) {
  case 0: {
    // ...case 0's arm
    break;
  }
  case 1: {
    // ...case 1's arm
    break;
  }
  default: {
    // ...Default arm
  }
}
```

Each case is wrapped in its own explicit `{ }` block, since JS `switch` cases otherwise
share one block scope — this keeps each arm's locally-declared variables from leaking
into the next case, the same scoping guarantee Branch's arms get from `if`/`else`. A case
left unwired on canvas simply gets **no clause at all** in the generated `switch`; a
wired Default still catches any selection that would have matched it.
