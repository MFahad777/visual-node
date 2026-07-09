---
title: Overview
slug: /examples
---

# Examples

Six worked flows live in the [`examples/`
folder](https://github.com/MFahad777/visual-node/tree/main/examples) on the `main`
branch of the repository, each with a source blueprint file, the compiled `.js`
output, and a binary `.blueprint` you can open directly in the editor. Every example has
been built and run for real — the curl commands and output on each page are not hypothetical.

| Example | Demonstrates |
| --- | --- |
| [Hello World](/examples/hello-world) | The minimal flow: init → middleware → route → handler → listen |
| [REST CRUD with Variables](/examples/rest-crud-with-variables) | Variables (`variable.get`/`variable.set`) + Handler Function's code/blueprint dual mode |
| [Custom Middleware Logging](/examples/custom-middleware-logging) | The middleware escape hatch (`middleware.customCode`) |
| [Function Graph with Branch](/examples/function-graph-branch) | A visual Function Graph with `controlFlow.branch` |
| [Function Graph with Recursion](/examples/function-graph-recursion) | A recursive function in a visual Function Graph (factorial example) |
| [npm Package Require](/examples/npm-package-require) | Requiring an npm package + the Async Handler checkbox |

## Opening an example in the editor

Clone the repository, check out `main` (the examples live there, not on this
documentation branch), and point visual-node at the example's folder:

```bash
git clone https://github.com/MFahad777/visual-node.git
cd visual-node
npx visual-node examples/01-hello-world
```
