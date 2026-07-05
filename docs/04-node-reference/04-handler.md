---
title: Handler
---

# Handler nodes

Terminal nodes at the end of a route's handler chain — neither has an execution output,
so nothing can come after one on the same chain.

## Send JSON — `handler.sendJson`

Responds with a JSON body and status code.

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

## Custom Code — `handler.customCode`

The escape hatch for handlers: raw JavaScript inserted verbatim into the handler body,
with no wrapping.

- **Inputs**: `in` — "Request"
- **Outputs**: none
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `code` | code | `""` | Available: `req`, `res`. Call `res.json(...)`/`res.send(...)` to respond — a plain `return` does nothing. |
| `npmDependencies` | text | `""` | Comma-separated npm packages, e.g. `"uuid@^9.0.0"`. Declares them for `package.json` — does not install them. |

Unlike Custom Middleware, this node's `code` is spliced in exactly as written, with no
wrapping function at all — it's just a statement (or several) at this position in the
handler.

Also usable inside a [Function Graph](/core-concepts/function-graphs-and-blueprint-mode)
body — since its emitted code has no hard dependency on `req`/`res` being real Express
objects, it doubles as a generic escape-hatch statement there too.
