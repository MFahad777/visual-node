> **🤖 VIBE CODED.** This project was built end-to-end through AI-assisted ("vibe
> coding") development sessions. Review the generated code before trusting it in
> production, same as you would for any dependency.

# visual-node

Visual, node-based backend builder for Node.js. Drag-and-drop flows **compile** to real,
readable, git-friendly Express.js source — this is a codegen tool, not a runtime
interpreter like Node-RED/n8n. The code it produces is meant to be read, committed, and
hand-edited afterward, not hidden behind the tool forever.

Full documentation, core concepts, and guides are available at [Documentation](https://mfahad777.github.io/visual-node).

## Quick start

```bash
npx visual-node [projectDir]
```

This opens an editor at `http://localhost:4000` against `projectDir` (defaults to the
current directory). Build a flow on the canvas, hit **Compile** to generate an Express
server from it, then **Run Server** to spawn and test it right there — or just read the
generated `.js` files and take it from there yourself.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port the editor itself listens on |
| `FLOWSERVER_PROJECT_DIR` | current directory | Project directory (overridden by a CLI arg) |

## How it works

A flow is a graph of nodes (`express.init`, `express.route`, `handler.sendJson`,
`logic.function`, custom-code escape hatches, and more) connected by wires representing
either execution order or data. Compiling walks that graph and emits plain CommonJS
Express source — no runtime dependency on this tool ships with the generated server.
`.blueprint` files (the flow's saved source of truth) live alongside your generated code
in your project directory, so the whole thing is a normal, committable folder.

See [`examples/`](examples/) for five worked flows, from a minimal "Hello World" route up
through Variables, visual Function Graphs with branching, and npm-package dependencies —
each includes the source flow, the compiled output, and a short write-up of what it
demonstrates.

## CHANGELOG

### Phase 14: Same-File Function Calls and Recursion in Function Graphs

**New Features:**

- **Recursive function support**: Functions can now call themselves within their own Blueprint graphs. Write a factorial function that calls itself for actual recursive logic.
- **Same-file function calls**: Inside a Function's Blueprint graph editor, the right-click picker now offers a new "Functions in This File" section, listing all sibling functions declared in the same `.blueprint` file alongside the current function.
- **Recursive call labeling**: When adding a function that calls itself, the picker clearly labels it as "(recursive)" to distinguish it from sibling function calls.

**How It Works:**

- `logic.functionCall` nodes now support two call modes via a `callKind` field:
  - `"require"` (default): calls an exported function from another file via `variableName.functionName(args)` — the original behavior, unchanged
  - `"sameFile"`: calls a sibling function in the same file via a bare `functionName(args)` — new, enables recursion
- Validation automatically accepts recursive self-calls (a function's own name is included in the set of callable same-file functions)
- Live parameter lists: when adding a recursive call, the picker shows the function's current parameters from the Details panel's Inputs section — not stale values from the last save

**Implementation Details:**

- **Core changes** (`packages/core/src/nodes/logic/function-call.node.ts`):
  - New `callKind` discriminant field in node config (default `"require"` for backward compatibility)
  - `buildFunctionCallExpression()` emits bare `functionName(args)` for same-file calls
  - No migration needed — all existing `.blueprint` files compile identically
  
- **Validation** (`packages/core/src/schema/validate.ts`):
  - `validateFunctionGraph()` checks same-file calls against the outer file's `logic.function` names
  - Recursion validated for free — the function's own name is in the sibling set
  
- **Editor** (`packages/editor-ui/src/components/FunctionGraphNodePicker.tsx`):
  - New "Functions in This File" section in the Blueprint graph picker
  - Reads live parameter list from the local `logic.graphEntry` node (not the outer function node's possibly-stale `data.params`)
  - Generates unique `resultVariable` names automatically
  
- **Display** (`packages/editor-ui` UI components):
  - `NodeConfigPanel.tsx` and `GenericNode.tsx` updated to show correct syntax for each call mode

**Tested & Verified:**

- Real recursive execution: a factorial-shaped Blueprint graph (guard branch → base case → recursive call → multiply result) compiles and executes correctly (`factorial(5) === 120`)
- Same-file calls emit bare function names (no module prefix)
- Validation accepts recursive self-calls and rejects calls to non-existent functions
- Backward compatible: all existing `.blueprint` files (using `callKind: "require"` implicitly) compile unchanged
- **Parameter sync fix**: recursive function call nodes now properly display parameter input pins when parameters are added/removed/renamed after the node is placed on the canvas
- All 332 core tests pass; `editor-ui` and `editor-server` build clean

**Out of Scope (Intentionally):**

- Main-canvas pickers: same-file calls are only available inside Function Graph editors, since the main canvas has no equivalent use case (functions aren't declared there)
- Browser verification: deferred to user per request — confidence comes from automated real-execution tests

**Example:**

```
// In a Function Graph for a function named "factorial":
Entry (parameter: n)
  ↓
Branch (condition: n <= 1)
  ├─ True → Return(1)
  └─ False → Subtract(n, 1) → FunctionCall("factorial", callKind: "sameFile") → Multiply(n, result) → Return(result)

// Compiles to:
function factorial(n) {
  if ((n <= 1)) {
    return (1);
  } else {
    const _sub = ((n) - (1));
    const rec = factorial(_sub);
    const _mul = ((n) * (rec));
    return (_mul);
  }
}
```