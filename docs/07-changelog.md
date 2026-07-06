---
sidebar_label: Changelog
---

# Changelog

## Version 0.3.0 (Latest)

### New

#### Early Return Support in Functions
The **Return** node now has an execution input pin. You can place multiple Return nodes anywhere in your Function Graph to create true early returns (e.g., guard clauses that exit before reaching the end). Pre-existing projects continue to work unchanged.

**Use case**: Exit a function early based on conditions without executing the rest of the function.

#### Sequence Control-Flow Node
A new **"Sequence"** node lets you run multiple independent code paths unconditionally, in left-to-right order. Useful for pinning down statement order when graph wiring alone doesn't determine it. Add or remove pins directly on the node with on-canvas **"+ Add pin"** and **"×"** buttons.

**Use case**: Execute a series of independent operations in a guaranteed order, such as multiple guard clauses or sequential side effects.

#### Function Recursion
Functions can now call themselves. Inside a Function Graph, the node picker now shows a **"Functions in This File"** section alongside imported functions, letting you wire recursive calls (e.g., a factorial that calls itself).

**Use case**: Implement recursive algorithms like tree traversal, factorial calculation, or divide-and-conquer patterns.

#### Project Settings
A new **Settings** tab lets you declare how your project runs:

- **Server mode** (default): Runs the entry point `.blueprint` file containing an `express.listen` node. Auto-detects the entry file or optionally specify it.
- **Script mode**: Runs the currently open `.blueprint` file as a standalone Node.js script, regardless of content. Perfect for pure logic helper files with no Express nodes.

The Run button label and behavior adapt to your choice. Settings are saved to `visual-node-project-settings.json` at your project root.

**Use case**: Switch between running an Express server and running pure logic utilities as Node.js scripts.

#### Flexible Equality Comparisons
**Equal** and **Not Equal** nodes now have a **"Strict"** toggle in their config. Turn it off to use loose comparison (`==`/`!=`) instead of strict (`===`/`!==`). Each comparison mode is visually labeled on the canvas for clarity.

**Use case**: Handle type coercion cases where loose equality is appropriate, such as comparing `"5"` with `5`.

### Modified

#### Return Node Behavior
Return nodes are no longer singletons managed by a special panel. Each Return is now a regular node you add from the picker. Unwired Return nodes fall back to the old behavior (appended after the whole function), so existing projects aren't affected.

#### Run Button
In Server mode, the button reads **"Run Server."** In Script mode, it dynamically shows **"Run `<filename>.js"`** based on the currently open file, making it clear which file will execute.

#### Function Graph Node Picker
Now includes both **"Function Calls"** (functions from imported modules via Require nodes) and **"Functions in This File"** (local functions, marked "(recursive)" for the function being edited).

### Removed

#### Return Node Panel
The singleton **"Outputs"** section for managing a single Return node has been removed. Return nodes are now fully independent and added like any other node.

---

## How to Upgrade

No action needed — all changes are **backward compatible**. Existing projects continue to work unchanged:

- Projects with unwired Return nodes compile the same way as before.
- Equal/NotEqual nodes without a "Strict" config default to strict comparison (`===`/`!==`).
- Projects without a settings file auto-detect Server mode with the existing `express.listen` scan.

### To use new features:

1. Open **Settings** and choose **Server** or **Script** mode (or leave it unset to auto-detect).
2. Try the new **Sequence** node for ordering independent code paths.
3. In Function Graphs, use multiple **Return** nodes for early exits, or call a function recursively via **"Functions in This File."**
4. Toggle **Strict** on Equal/NotEqual nodes to use loose comparison when needed.
