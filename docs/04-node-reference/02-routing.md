---
title: Routing
---

# Routing nodes

## Route — `express.route`

Defines an HTTP route and wires it to a handler chain.

- **Inputs**: `in` — "App"
- **Outputs**: `out` — "Handler"
- **Config fields**:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `method` | select | `GET` | One of `GET`, `POST`, `PUT`, `DELETE`, `PATCH`. |
| `path` | text | `/` | |
| `isAsync` | boolean | `false` | Enable to use `await` inside this handler chain (e.g. for an async plugin node). |

- **Constraints**: the "Handler" output must have at least one outgoing wire — an
  unattached Route fails compilation with a clear error naming the route. If the wired
  handler chain requires `await` but `isAsync` isn't enabled, compiling fails rather than
  emitting invalid JavaScript.

Everything wired downstream from "Handler" — Custom Code, Send JSON, Console Log,
Branch/Switch, operators, Function Call, Set Variable, and so on — is compiled by the
same [exec-chain walker](/core-concepts/how-codegen-works) into this route's body.

```js
app.get("/hello", (req, res) => {
  res.status(200).json({ message: "Hello World" });
});
```

With `isAsync` enabled, the arrow function is prefixed `async (req, res) => { ... }`,
letting the chain use `await` (see the [npm Package Require
example](/examples/npm-package-require)).
