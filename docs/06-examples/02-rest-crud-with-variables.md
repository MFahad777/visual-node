---
title: REST CRUD with Variables
---

# REST CRUD with Variables

An in-memory `items` REST API demonstrating the [Variables
system](/node-reference/logic) alongside the Custom Code escape hatch.

**Nodes involved:** `variable.set`, `variable.get`, `debug.consoleLog`,
`handler.customCode`, `handler.sendJson`, plus the standard `express.*` wiring.

A file-scoped `let items = []` (declared once, in the flow's Variables panel) backs four
routes:

- `GET /items` — reads `items` directly (a Custom Code node can reference any
  file-scoped variable by name, no wiring needed).
- `POST /items` — pushes a new item built from `req.body`.
- `DELETE /items/:id` — reassigns `items` via a wired **Set Variable** node (its literal
  value field holds `items.filter(...)`), then responds with a static Send JSON node.
- `GET /items/count` — wires a **Get Variable** node's output into a **Console Log**
  node (logging the current array server-side) before a Custom Code node responds with
  the count — the one route here that actually wires a value pin end to end, rather than
  referencing the variable by bare identifier.

## Generated `server.js`

```js
const express = require("express");

const app = express();

let items = [];

app.use(express.json());

app.get("/items", (req, res) => {
  res.status(200).json(items);
});

app.post("/items", (req, res) => {
  const item = { id: String(items.length + 1), ...req.body };
  items.push(item);
  res.status(201).json(item);
});

app.delete("/items/:id", (req, res) => {
  items = items.filter((item) => item.id !== req.params.id);
  res.status(200).json({ success: true });
});

app.get("/items/count", (req, res) => {
  console.log(items);
  res.status(200).json({ count: items.length });
});

app.listen(3002, () => {
  console.log("Server running on port 3002");
});
```

## Run it

```bash
npx visual-node examples/02-rest-crud-with-variables
```

```bash
curl http://localhost:3002/items                                    # []
curl -X POST -H 'content-type: application/json' -d '{"name":"widget"}' http://localhost:3002/items
curl http://localhost:3002/items                                    # [{"id":"1","name":"widget"}]
curl http://localhost:3002/items/count                               # {"count":1}
curl -X DELETE http://localhost:3002/items/1                         # {"success":true}
```
