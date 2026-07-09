# REST CRUD with Variables

An in-memory `items` REST API demonstrating the **Variables** system alongside
**Handler Function**'s code/blueprint dual authoring mode.

**Nodes involved:** `variable.set`, `variable.get`, `debug.consoleLog`,
`logic.handlerFunction`, `handler.sendJson`, plus the standard `express.*` wiring.

A file-scoped `let items = []` (declared once, in the flow's **Variables** panel) backs
four routes, each attached to its own Handler Function:

- `GET /items` — a code-mode Handler Function reads `items` directly (code mode can
  reference any file-scoped variable by name, no wiring needed).
- `POST /items` — a code-mode Handler Function pushes a new item built from `req.body`.
- `DELETE /items/:id` — a blueprint-mode Handler Function reassigns `items` via a wired
  **Set Variable** node (its literal value field holds `items.filter(...)`), then
  responds with a static `Send JSON` node.
- `GET /items/count` — a code-mode Handler Function logs the current array server-side
  and responds with its live length.

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
