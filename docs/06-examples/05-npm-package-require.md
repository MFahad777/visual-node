---
title: npm Package Require
---

# npm Package Require

Demonstrates requiring an installed npm package (not just another local `.blueprint`
file) and the Async Handler checkbox for `await`-ing inside a route.

**Nodes involved:** `logic.require` (Source: npm, Package: `uuid`, Version: `^9.0.0`),
`express.route` with Async Handler enabled, `handler.customCode`. See the [Logic
section](/node-reference/logic) and [Routing section](/node-reference/routing) of the
Node Reference for both.

The Require node emits `const uuid = require("uuid");` at the top of the file and
declares `uuid` as a dependency — compiling this flow (or the whole project) collects it
into the generated `package.json`, so `npm install` in the output directory pulls in
everything the flow needs.

:::caution Pin your npm version deliberately
This example pins `^9.0.0`. Newer `uuid` majors ship ESM-only and can't be `require()`'d
from CommonJS output — this pin is load-bearing, not arbitrary. Since visual-node
generates CommonJS by default, check any npm package's module format before requiring it
in a flow.
:::

The route itself has Async Handler checked, so its generated handler is
`async (req, res) => { ... }`, letting the Custom Code node `await` a promise (here just
a small `setTimeout` delay, standing in for any real async work like a database call or
network request) before responding.

## Generated `server.js`

```js
const express = require("express");
const uuid = require("uuid");

const app = express();

app.use(express.json());

app.get("/id", async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  res
    .status(200)
    .json({ id: uuid.v4(), generatedAt: new Date().toISOString() });
});

app.listen(3005, () => {
  console.log("Server running on port 3005");
});
```

## Run it

```bash
npx visual-node examples/05-npm-package-require
```

```bash
curl http://localhost:3005/id
# {"id":"...","generatedAt":"..."}
```
