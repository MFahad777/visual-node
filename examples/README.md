# Examples

Five worked flows, each in its own folder with a source `flow.json`, the compiled
`server.js` output, and a `.blueprint` binary you can open directly in the editor. Every
example has been built and run for real — the curl commands in each `README.md` are not
hypothetical.

| Example | Demonstrates |
| --- | --- |
| [`01-hello-world`](01-hello-world/) | The minimal flow: init → middleware → route → handler → listen |
| [`02-rest-crud-with-variables`](02-rest-crud-with-variables/) | Variables (`variable.get`/`variable.set`) + the Custom Code escape hatch |
| [`03-custom-middleware-logging`](03-custom-middleware-logging/) | The middleware escape hatch (`middleware.customCode`) |
| [`04-function-graph-branch`](04-function-graph-branch/) | A visual Function Graph with `controlFlow.branch` |
| [`05-npm-package-require`](05-npm-package-require/) | Requiring an npm package + the Async Handler checkbox |

## Opening an example in the editor

```bash
npx visual-node examples/01-hello-world
```

## Regenerating `server.js` / `.blueprint` from `flow.json`

Each example's `flow.json` is the hand-editable source of truth. After changing one,
regenerate its compiled output from the repo root (requires `pnpm -r run build` to have
been run first, so `packages/core/dist` exists):

```bash
node examples/build.mjs
```
