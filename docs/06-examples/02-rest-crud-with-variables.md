---
title: REST CRUD with Variables
---

# REST CRUD with Variables

An in-memory `items` REST API demonstrating the [Variables
system](/node-reference/logic) alongside [Handler Function](/node-reference/logic#handler-function--logichandlerfunction)'s
code/blueprint dual authoring mode.

**Nodes involved:** `variable.set`, `variable.get`, `debug.consoleLog`,
`logic.handlerFunction`, `handler.sendJson`, plus the standard `express.*` wiring.

A file-scoped `let items = []` (declared once, in the flow's Variables panel) backs four
routes, each attached to its own Handler Function:

- `GET /items` — a code-mode Handler Function reads `items` directly (code mode can
  reference any file-scoped variable by name, no wiring needed).
- `POST /items` — a code-mode Handler Function pushes a new item built from `req.body`.
- `DELETE /items/:id` — a blueprint-mode Handler Function reassigns `items` via a wired
  **Set Variable** node (its literal value field holds `items.filter(...)`), then
  responds with a static Send JSON node.
- `GET /items/count` — a code-mode Handler Function logs the current array server-side
  and responds with its live length.

## Generated `server.js`

```js
const express = require("express");

const app = express();

let items = [];

function listItems(req, res, next) {
  res.status(200).json(items);
}

function createItem(req, res, next) {
  const item = { id: String(items.length + 1), ...req.body };
  items.push(item);
  res.status(201).json(item);
}

function deleteItem(req, res, next) {
  items = items.filter((item) => item.id !== req.params.id);
  res.status(200).json({ success: true });
}

function countItems(req, res, next) {
  console.log("items snapshot:", items);
  res.status(200).json({ count: items.length });
}

app.use(express.json());

app.get("/items", listItems);

app.post("/items", createItem);

app.delete("/items/:id", deleteItem);

app.get("/items/count", countItems);

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
