---
title: Operators
---

# Operator nodes

All 17 operator nodes share the same shape: **pure, value-producing, no execution
pins** — they never sit in a handler chain themselves, only feed a value into one. Every
operator has an **empty config schema**; instead, an unwired input's literal default is
edited directly on the pin itself, right on the canvas.

Every operator resolves its result the same way: `resultIdentifier` is
`` `_op_<sanitized node id>` ``, and it emits

```js
const _op_<id> = (<expression>);
```

If an input pin is left unwired with no literal typed in, arithmetic/comparison
operators fall back to `0` and boolean operators fall back to `false` — they never throw
for a merely-unwired input.

Usable both on the main canvas and inside a [Function
Graph](/core-concepts/function-graphs-and-blueprint-mode) — full parity, no exceptions.

## Arithmetic

Inputs `a`, `b` (value); output `result` (value).

| Node type | Label | Generated expression |
| --- | --- | --- |
| `operators.add` | Add | `a + b` |
| `operators.subtract` | Subtract | `a - b` |
| `operators.multiply` | Multiply | `a * b` |
| `operators.divide` | Divide | `a / b` |
| `operators.modulo` | Modulo | `a % b` |

```js
// Add, a = 17, b = 5
const _op_add1 = (17 + 5);
```

## Comparison

Inputs `a`, `b` (value); output `result` (value). Same shape as arithmetic, just a
different operator.

| Node type | Label | Generated expression |
| --- | --- | --- |
| `operators.equal` | Equal | `a === b` |
| `operators.notEqual` | Not Equal | `a !== b` |
| `operators.greaterThan` | Greater Than | `a > b` |
| `operators.lessThan` | Less Than | `a < b` |
| `operators.greaterOrEqual` | Greater Or Equal | `a >= b` |
| `operators.lessOrEqual` | Less Or Equal | `a <= b` |

## Boolean (variadic)

Inputs `a`, `b`, plus any number of extra inputs added on canvas via a **"+ Add pin"**
button (stable, non-renumbered ids like `extra-0`, `extra-3`); output `result` (value).
Every operand is wrapped in `Boolean(...)` before combining, so the result is always a
real boolean, never a raw truthy passthrough.

| Node type | Label | Combines operands with |
| --- | --- | --- |
| `operators.and` | AND | `&&` — true only if every input is truthy |
| `operators.nand` | NAND | negated AND — false only if every input is truthy |
| `operators.or` | OR | `\|\|` — true if at least one input is truthy |
| `operators.nor` | NOR | negated OR — true only if every input is falsy |
| `operators.xor` | XOR | pairwise `!==` fold — true if an **odd** number of inputs are truthy |

```js
// AND with 3 inputs
const _op_and1 = (Boolean(a) && Boolean(b) && Boolean(c));

// XOR with 2 inputs
const _op_xor1 = (Boolean(a)) !== (Boolean(b));
```

## Unary

The one operator with a single input.

### NOT — `operators.not`

- **Inputs**: `a` (value)
- **Outputs**: `result` (value)

```js
const _op_not1 = !(Boolean(a));
```

## A main-canvas example

Operators aren't limited to Function Graphs — wiring `operators.add` (with literals
`a: 5, b: 7`) into a `handler.customCode` node's arbitrary value handle hoists the
declaration ahead of the handler body automatically:

```js
app.get("/sum", (req, res) => {
  const _op_add1 = (5 + 7);
  res.status(200).json({ sum: _op_add1 });
});
```

See [How Code Generation Works](/core-concepts/how-codegen-works) for why this hoisting
happens even though nothing wired the operator directly into the route's chain.
