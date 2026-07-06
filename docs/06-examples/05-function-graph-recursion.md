---
title: Function Graph with Recursion
---

# Function Graph with Recursion

A `logic.function` node ("factorial") authored in [blueprint
mode](/core-concepts/function-graphs-and-blueprint-mode) — a nested visual node graph
instead of hand-typed code — using `controlFlow.branch` to guard against the base case
and a recursive `logic.functionCall` with `callKind: "sameFile"` to call itself.

**Nodes involved (inside the function's nested graph):** `logic.graphEntry`,
`controlFlow.branch`, `operators.subtract`, `operators.multiply`, recursive
`logic.functionCall`, `logic.graphReturn`. **On the main canvas:** the same `logic.function`
node (private — never wired to an Export, so it stays a file-local helper), called directly
by name from a `handler.customCode` node.

The nested graph: Start (parameter: `n`) → Branch (condition `n <= 1`) → **True** arm
returns `1` (base case); **False** arm computes `n - 1`, calls `factorial()` recursively
with that value, multiplies the result by `n`, and returns that. Each recursive call's
result flows through naturally — no variables needed to shuttle values between branches.

## Generated `server.js`

```js
const express = require("express");

const app = express();

function factorial(n) {
  if ((n <= 1)) {
    return (1);
  } else {
    const _sub = ((n) - (1));
    const rec = factorial(_sub);
    const _mul = ((n) * (rec));
    return (_mul);
  }
}

app.use(express.json());

app.get("/factorial", (req, res) => {
  const n = Number(req.query.n ?? 0);
  res.status(200).json({ n, factorial: factorial(n) });
});

app.listen(3005, () => {
  console.log("Server running on port 3005");
});
```

## Run it

```bash
npx visual-node examples/05-function-graph-recursion
```

```bash
curl "http://localhost:3005/factorial?n=5"   # {"n":5,"factorial":120}
curl "http://localhost:3005/factorial?n=1"   # {"n":1,"factorial":1}
curl "http://localhost:3005/factorial?n=0"   # {"n":0,"factorial":1}
curl "http://localhost:3005/factorial?n=10"  # {"n":10,"factorial":3628800}
```
