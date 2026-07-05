---
title: Debugging
---

# Debugging nodes

## Console Log — `debug.consoleLog`

Prints a value to the server console, then continues to the next node in the chain.

- **Inputs**: `in` — "Request" (exec); `value` (value) — "Value"
- **Outputs**: `out` — "Next" (exec)
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `expression` | code | `"Debug:"` | Available: `req`, `res`. Any JS expression(s), comma-separated for multiple `console.log` arguments, e.g. `req.method, req.path`. Ignored while the Value pin is wired. |

If "Value" is wired, the typed `expression` field is ignored entirely and the upstream
node's resolved value is logged instead:

```js
// Value pin wired to an Add operator
const _op_add1 = (2 + 3);
console.log(_op_add1);

// Value pin unwired, expression: 'req.method, req.path'
console.log(req.method, req.path);
```

Usable both on the main canvas and inside a Function Graph — like `handler.customCode`,
it doubles as a generic escape-hatch statement there too.
