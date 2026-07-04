# Hello World

The canonical minimal flow — the shape every other example builds on.

**Nodes involved:** `express.init`, `express.middleware.jsonParser`, `express.route`,
`handler.sendJson`, `express.listen`.

A single `GET /hello` route answers with a static JSON body. No custom code, no
variables, no dependencies — just the five node types every generated server starts
from.

## Run it

```bash
npx visual-node examples/01-hello-world
```

Open `http://localhost:4000`, hit **Compile**, then **Run Server** to spawn it — or just
read the committed [`server.js`](server.js), which is exactly what compiling this flow
produces.

```bash
curl http://localhost:3001/hello
# {"message":"Hello World"}
```
