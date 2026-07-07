---
sidebar_label: Changelog
---

# Changelog

## Version 0.4.1 (Latest)

Patch release fixing three bugs that could combine to make Save and live error-checking
seem to stop working, with no error message to explain why.

### Fixed

- **Save did nothing when no file was open.** Clicking **Save** with no file open gave
  no feedback at all — no error, no confirmation. It now shows a clear message
  explaining that no file is open, and the Save button is disabled with an "Open a file
  first" tooltip in that state, matching Compile and Run.
- **A Sequence node using only its default first branch failed validation.** A
  **Sequence** node that never needed more than its built-in first output pin was
  incorrectly flagged as invalid, even though nothing was actually wrong with it. Fixed
  — Sequence nodes now validate correctly whether or not you've added extra branches.
- **Adding an "Includes" or "Index Of" node could silently break Save for the rest of
  your session.** Placing an Array **Includes** or **Index Of** node on the canvas
  could cause Save and live validation to silently stop updating, with no visible error
  and no request ever reaching the server — leaving you unsure why your changes weren't
  saving. This is now fixed, as a general fix that also protects any future node with a
  similar optional setting.

## Version 0.4.0

### New

#### Export variables, not just functions
The **Export** node has a new **Variables** input. Wire a **Get Variable** node into it
(alongside any functions you're already exporting) and that variable becomes available
to any file that imports this one — just like exporting a function.

**Use case**: Share a shared setting or constant (like an app version or a config value)
across multiple files, the same way you already share functions.

#### Variables panel is easier to work with
The Variables panel got a few quality-of-life improvements:

- A **search box** to quickly filter your variable list by name.
- A **collapse/expand** button on each variable so you can hide its details and save
  space once it's set up.
- A **quick-preview button** to peek at a variable's default value without expanding the
  whole row.

**Use case**: Makes it much easier to manage projects with a lot of variables.

#### Simpler editor for complex variable values
Setting a default value for an object, array, map, or set variable is now a single,
straightforward code editor (instead of switching between two different editing modes).
There's also a new **expand to fullscreen** button for editing longer or more complex
values comfortably, with helpful format examples shown alongside it.

**Use case**: Less friction when setting up default values for more advanced variable
types.

#### New Array nodes
15 new nodes for working with arrays are now available (grouped under a new **Array**
category), covered in full on the [Array node reference](/node-reference/array) page:

- **Loop nodes** — Map, Filter, For Each, Flat Map, Find, Find Index, Every, Some, and
  Reduce. You can now build what happens on each pass of the loop visually, by wiring
  nodes into the node's **Loop Body**, instead of only being able to type raw code for it.
- **Everyday array actions** — Push, Pop, Add to Front (unshift), Remove from Front
  (shift), Includes, and Index Of, for quickly adding, removing, or searching items in a
  list.

**Use case**: Handle common list/array tasks — transforming, filtering, searching,
adding, and removing items — without writing code.

#### New node: Path Extractor
A new **[Path Extractor](/node-reference/logic#path-extractor--logicpathextractor)** node
reads a value from deep inside an object using a simple path, like `items[0].name` or
`store.getInvoice`, and — if what it finds turns out to be a function — can call it for
you with the parameters you provide.

**Use case**: Pull a nested value or call a method from dynamic data (e.g. an API
response) without having to write custom code.

### Improved

- **Clearer rule for exporting variables**: a variable declared with `const` and no
  starting value can't be exported, since it wouldn't have a value yet at that point.
  Give it a default value, or declare it with `let`/`var` instead.
- Generated code for the **Path Extractor** node is now smaller and more efficient —
  no changes needed on your part, existing flows keep working exactly as before.

### Fixed

- **Duplicate exports**: wiring the same variable or function into the Export node more
  than once used to silently produce a broken/duplicated export. It's now caught with a
  clear message telling you what's duplicated.
- **Path Extractor crash in rare cases**: certain combinations of wiring could cause the
  generated server to crash when Path Extractor ran. This is now fixed.
- **Array loop nodes could mix up their variables when nested**: using one loop node
  inside another (e.g. a Map inside a Filter) could cause their element/index values to
  interfere with each other. Each loop now keeps its own variables properly separate, so
  nesting loops works reliably.

### Removed

- The old "Visual" (row-by-row) mode for editing complex variable default values has been
  removed in favor of the simpler code editor described above.

### Documentation

- New [Array node reference](/node-reference/array) page covering all the new array
  nodes.
- The [Logic node reference](/node-reference/logic) and [Node
  Reference overview](/node-reference) pages have been updated for the new Path
  Extractor node and the Export node's Variables input.

---

## Version 0.3.0

### New

#### Early returns in Functions
The **Return** node can now be placed anywhere inside a function, not just at the very
end. This lets you write true early returns — for example, exiting immediately once a
condition is met — instead of always running to the bottom of the function. Existing
projects keep working exactly as before.

**Use case**: Write guard clauses that exit a function early, without restructuring the
rest of your logic.

#### New node: Sequence
A new **Sequence** node lets you run several independent chains of nodes, one after
another, in a guaranteed left-to-right order. Add or remove branches directly on the
node with the **"+ Add pin"** button.

**Use case**: Make sure a series of checks or actions always run in a specific order,
even when nothing else about how they're wired would guarantee that.

#### Functions can now call themselves (recursion)
When editing a function's visual logic, the node picker now shows a **"Functions in This
File"** section, letting you wire a function to call itself.

**Use case**: Build recursive logic, like calculating a factorial or walking a tree
structure.

#### Project Settings
A new **Settings** tab lets you tell the app how to run your project:

- **Server mode** (default) — runs your project as an Express web server.
- **Script mode** — runs the file you currently have open as a plain, standalone script.
  Handy for files that are just logic/utilities with no web server involved.

The Run button updates its label and behavior to match your choice.

**Use case**: Run simple utility scripts the same way you run a full server, without
extra setup.

#### Flexible equality comparisons
The **Equal** and **Not Equal** nodes now have a **"Strict"** toggle. Turn it off to
allow loose comparisons (so, for example, `"5"` and `5` are treated as equal).

**Use case**: Handle cases where you want to compare values loosely instead of requiring
an exact type match.

### Improved

- The **Return** node is no longer a special one-of-a-kind node — you can now add as many
  as you like, just like any other node.
- The Run button now shows exactly what it's about to run — "Run Server" in Server mode,
  or the specific file name in Script mode.
- The node picker inside a function's visual editor now clearly separates functions from
  other files ("Function Calls") from functions in the current file ("Functions in This
  File"), labeling the current function "(recursive)" when it can call itself.

### Removed

- The old dedicated panel for managing a single Return node has been removed, since
  Return nodes now work like any other node on the canvas.

---

## Upgrading

No action needed — every change above is fully backward compatible. Existing projects
keep working exactly as they did before.

### To try the new features:

1. Open **Settings** and choose **Server** or **Script** mode for your project.
2. Try the new **Sequence** node when you need actions to run in a specific order.
3. Use multiple **Return** nodes for early exits, or let a function call itself via
   **"Functions in This File."**
4. Turn off **Strict** on an Equal/Not Equal node when you want a looser comparison.
5. Wire a **Get Variable** node into an Export node's new **Variables** input to share a
   variable across files.
6. Explore the new **Array** nodes for working with lists, and the new **Path Extractor**
   node for reading values out of dynamic data.
