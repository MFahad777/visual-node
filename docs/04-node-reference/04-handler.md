---
title: Handler
---

# Handler nodes

:::info Looking for the raw-code handler escape hatch?
The old `handler.customCode` node has been removed. Raw JavaScript handlers are now
written in a [Handler Function](/node-reference/logic#handler-function--logichandlerfunction)
node's "code" mode instead — see the [Routing reference](/node-reference/routing) for how
a Route attaches to one.
:::

## Send JSON — `handler.sendJson`

Responds with a JSON body and status code. Used inside a [Handler
Function](/node-reference/logic#handler-function--logichandlerfunction)'s
blueprint-mode body — a Route can no longer wire to Send JSON directly, only to a
Handler Function.

- **Inputs**: `in` — "Request"
- **Outputs**: none
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `statusCode` | number | `200` | Falls back to `200` if not a finite number. |
| `body` | code (JSON value) | `{}` | A JSON-serializable value — this field holds actual data, not a JS expression string. |

```js
res.status(200).json({ message: "Hello World" });
```
