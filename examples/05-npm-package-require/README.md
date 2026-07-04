# npm Package Require

Demonstrates requiring an installed npm package (not just another local `.blueprint`
file) and the **Async Handler** checkbox for `await`-ing inside a route.

**Nodes involved:** `logic.require` (Source: npm, Package: `uuid`, Version: `^9.0.0`),
`express.route` with **Async Handler** enabled, `handler.customCode`.

The Require node emits `const uuid = require("uuid");` at the top of the file and
declares `uuid` as a dependency — compiling this flow (or the whole project) collects it
into the generated `package.json`, so `npm install` in the output directory pulls in
everything the flow needs. **Note the pinned `^9.0.0`**: newer `uuid` majors ship
ESM-only and can't be `require()`'d from CommonJS output — this pin is load-bearing, not
arbitrary.

The route itself has **Async Handler** checked, so its generated handler is
`async (req, res) => { ... }`, letting the Custom Code node `await` a promise (here just
a small `setTimeout` delay, standing in for any real async work like a database call or
network request) before responding.

## Run it

```bash
npx visual-node examples/05-npm-package-require
```

```bash
curl http://localhost:3005/id
# {"id":"...","generatedAt":"..."}
```
