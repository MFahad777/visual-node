# Custom Middleware Logging

Demonstrates the middleware escape hatch: a hand-written `app.use(...)` request logger
placed ahead of the JSON body parser.

**Nodes involved:** `middleware.customCode`, plus the standard `express.*` wiring and a
`handler.sendJson` route.

`middleware.customCode` wraps its raw code in `app.use((req, res, next) => { ... })` —
call `next()` to continue the chain, or respond directly to end it there. This example
just logs `METHOD path` for every request before falling through to a trivial
`GET /ping` route.

## Run it

```bash
npx visual-node examples/03-custom-middleware-logging
```

```bash
curl http://localhost:3003/ping
# {"pong":true}
```

Watch the server's console output — it prints `GET /ping` for the request above, logged
entirely from the custom middleware node.
