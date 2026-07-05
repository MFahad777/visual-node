---
title: Middleware
---

# Middleware nodes

## JSON Body Parser — `express.middleware.jsonParser`

Parses incoming requests with JSON payloads.

- **Inputs**: `in` — "App"
- **Outputs**: `out` — "App"
- **Config fields**: none

```js
app.use(express.json());
```

## Custom Middleware — `middleware.customCode`

The escape hatch for middleware: raw JavaScript inserted as an `app.use(...)` callback.

- **Inputs**: `in` — "App"
- **Outputs**: `out` — "App"
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `code` | code | `""` | Available: `req`, `res`, `next`. Call `next()` to continue to the next middleware/route, or send a response (`res.json`/`res.send`/`res.end`) to end the chain there. |
| `isAsync` | boolean | `false` | Enable to use `await` inside this middleware. |
| `npmDependencies` | text | `""` | Comma-separated npm packages this code requires, e.g. `"axios, lodash@^4.17.0"`. |

Your `code` is spliced verbatim (each line indented) into an `app.use(...)` wrapper — the
same trust level as typing raw JavaScript anywhere else in visual-node, no sandboxing.

```js
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

This is the exact code the [Custom Middleware Logging
example](/examples/custom-middleware-logging) generates from a one-line logger.
