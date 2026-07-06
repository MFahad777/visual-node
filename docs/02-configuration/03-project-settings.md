---
title: Project Settings
---

# Project Settings

The **Settings** button in the editor toolbar lets you configure how the Run button behaves
and which files are executed when you click it.

## Execution modes

Every project has one of two execution modes, set in the Settings modal:

### Server mode (default)

Runs your project as an Express server. The **Run** button compiles all `.blueprint` files
and spawns `node server.js` (or a custom entry file you specify).

- **Entry file** (optional): Leave blank to auto-detect via a scan for the `express.listen`
  node (the default, and how projects worked before settings existed). Or pick a specific
  `.blueprint` file from the dropdown — the Run button validates that it contains an
  `express.listen` node before running.
- **Backward compatible**: Existing projects with no settings file default to Server mode
  with auto-detect, so the Run button works unchanged on day one.

### Script mode

Runs the currently open `.blueprint` file as a plain Node.js script (no Express requirement).
Useful for running helper files, logic libraries, or any standalone code without the
overhead of a full server. The **Run** button reads `Run &lt;filename&gt;.js` (dynamic, showing
the currently open file).

- **No entry file needed** — whichever `.blueprint` file you have open in the editor runs.
- **Any file is valid** — no requirement for `express.init` or `express.listen` nodes.
  Pure-logic helper functions, math libraries, data processors — whatever you write
  compiles and executes.

## Accessing Settings

1. Click the **Settings** button in the toolbar (next to Browse Nodes).
2. The Settings modal opens.
3. Select Server or Script mode via the radio buttons.
4. If Server mode: optionally pick an entry file from the dropdown (or leave blank for
   auto-detect).
5. Click **Save** to persist, or **Cancel** to discard changes.

## Settings file

Settings are saved to `visual-node-project-settings.json` at your project root. This is a
regular, discoverable project file (not hidden like `.flowserver/plugins/`) and is safe to
commit to version control:

```json
{
  "mode": "server",
  "entryFile": "server.blueprint"
}
```

```json
{
  "mode": "script"
}
```

You can also edit this file by hand, though the Settings modal is the recommended approach
for avoid typos.

## Switching modes mid-project

It's safe to switch between Server and Script mode at any time. The Run button's behavior
updates immediately:

- **Switch to Server mode**: Run button reads "Run Server"; compiles and spawns a server.
- **Switch to Script mode**: Run button reads "Run &lt;filename&gt;.js"; runs the open file as a
  script.

If you switch to Server mode after using Script mode, the Run button falls back to auto-detect
(scanning for `express.listen`) unless you explicitly configured an entry file.
