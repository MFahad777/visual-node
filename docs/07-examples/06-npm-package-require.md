---
title: npm Package Require
---

# npm Package Require

A flow that requires an installed npm package (`axios`) and uses it inside a code-mode
[Handler Function](/node-reference/logic/handler-function).
Demonstrates how to declare npm dependencies and reference them by their require
variable name.

**Nodes involved:** `express.init`, `express.middleware.jsonParser`,
`logic.require` (npm mode, targeting `axios`), `express.route`, `logic.handlerFunction`
(code mode, using `axios` in raw JavaScript), `handler.sendJson`, `express.listen`.

The route's Handler Function (`POST /reverse`) accepts a `text` parameter, posts it to
an external API via `axios.post()`, and returns the result — the full Express
request/response cycle with a real async operation. The Handler Function's **Async
Handler** checkbox is checked, so the generated function is `async` and
`await axios.post()` works natively.

## Generated `server.js`

```js
const axios = require("axios");
const express = require("express");

const app = express();

async function handler(req, res, next) {
  const text = req.body.text ?? "";
  const response = await axios.post("https://api.example.com/reverse", {
    input: text,
  });
  res.status(200).json({ result: response.data });
}

app.use(express.json());

app.post("/reverse", handler);

app.listen(3006, () => {
  console.log("Server running on port 3006");
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
