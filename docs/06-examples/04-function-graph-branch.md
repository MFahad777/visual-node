---
title: Function Graph with Branch
---

# Function Graph with Branch

A `logic.function` node ("isEven") authored in [blueprint
mode](/core-concepts/function-graphs-and-blueprint-mode) — a nested visual node graph
instead of hand-typed code — using `controlFlow.branch` to fork execution and a
function-scoped Variable to carry the result back out.

**Nodes involved (inside the function's nested graph):** `logic.graphEntry`,
`controlFlow.branch`, `variable.set`, `variable.get`, `logic.graphReturn`. **On the main
canvas:** the same `logic.function` node (private — never wired to an Export, so it stays
a file-local helper), called directly by name from a `handler.customCode` node.

The nested graph: Start → Branch (condition `n % 2 === 0`, a literal expression, not
wired) → **True** arm sets a `result` variable to `true`, **False** arm sets it to
`false`. A Get Variable node feeds the Return node's value — since reading a variable is
always safe regardless of which arm set it, this sidesteps the restriction that a
Branch/Switch arm's own values can't be read directly from the Return node (see [How Code
Generation Works](/core-concepts/how-codegen-works)). Open this function's "Blueprint
Graph" from its config panel to see the two-arm graph on canvas.

## Generated `server.js`

```js
const express = require("express");

const app = express();

function isEven(n) {
  let result = false;
  if (n % 2 === 0) {
    result = true;
  } else {
    result = false;
  }
  return result;
}

app.use(express.json());

app.get("/is-even", (req, res) => {
  const n = Number(req.query.n ?? 0);
  res.status(200).json({ n, isEven: isEven(n) });
});

app.listen(3004, () => {
  console.log("Server running on port 3004");
});
```

## Run it

```bash
npx visual-node examples/04-function-graph-branch
```

```bash
curl "http://localhost:3004/is-even?n=4"   # {"n":4,"isEven":true}
curl "http://localhost:3004/is-even?n=7"   # {"n":7,"isEven":false}
```
