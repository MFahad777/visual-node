---
title: Environment Variables
---

# Environment Variables

visual-node's editor server recognizes exactly two environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | The port the **editor itself** listens on. |
| `VISUAL_NODE_PROJECT_DIR` | current working directory | The project directory the editor opens against. Overridden by a CLI argument if one is given. |

```bash
PORT=5000 VISUAL_NODE_PROJECT_DIR=./my-project npx visual-node
```

:::caution Don't confuse the editor's port with your generated server's port
`PORT` only controls the port the visual-node **editor UI** listens on. A **generated**
server's port is whatever you configured on its `express.listen` node — it does not read
`PORT` from the environment unless you explicitly wrote it that way yourself (e.g. inside
a Handler Function or `middleware.customCode` node).
:::

## Precedence

The project directory is resolved once, at startup, in this order:

1. The first CLI positional argument (`npx visual-node ./my-project`).
2. `VISUAL_NODE_PROJECT_DIR`.
3. `process.cwd()`.

See [Project Directory](/configuration/project-directory) for what visual-node expects to
find (and will create) inside that directory.
