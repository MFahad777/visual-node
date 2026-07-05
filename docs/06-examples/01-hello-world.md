---
title: Hello World
---

# Hello World

The canonical minimal flow — the shape every other example builds on.

**Nodes involved:** [`express.init`, `express.middleware.jsonParser`,
`express.route`, `handler.sendJson`, `express.listen`](/node-reference).

A single `GET /hello` route answers with a static JSON body. No custom code, no
variables, no dependencies — just the five node types every generated server starts
from.

## Generated `server.js`

```js
const express = require("express");

const app = express();

app.use(express.json());

app.get("/hello", (req, res) => {
  res.status(200).json({ message: "Hello World" });
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
```

## Run it

```bash
npx visual-node examples/01-hello-world
```

Open `http://localhost:4000`, hit **Compile**, then **Run Server** to spawn it — or just
read the committed `server.js` above, which is exactly what compiling this flow
produces.

```bash
curl http://localhost:3001/hello
# {"message":"Hello World"}
```
