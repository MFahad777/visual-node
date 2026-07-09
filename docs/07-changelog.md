---
sidebar_label: Changelog
---

# Changelog

## Version 1.0.0 (Latest)

### 🚨 Breaking Changes

- **Custom Code handlers are gone — replaced by Handler Function.** The old
  `handler.customCode` node (raw JavaScript wired directly onto a route) has been
  removed. Every route now needs a **Handler Function** node instead — see below. If you
  have existing flows using Custom Code as a handler, see "Upgrading" at the bottom of
  this page for the exact steps.
- **A Route's own "Async Handler" setting is gone.** It's now a checkbox on the Handler
  Function itself, not on the Route.
- **Environment variable renamed**: `FLOWSERVER_PROJECT_DIR` is now
  `VISUAL_NODE_PROJECT_DIR`. There's no fallback to the old name — if a script or shell
  profile still sets `FLOWSERVER_PROJECT_DIR`, rename it or the project directory won't
  resolve the way you expect.
- **Plugin folder renamed**: installed plugins now live in `.visualnode/plugins/` inside
  your project directory, instead of `.flowserver/plugins/`. If you have an existing
  project with plugins installed, rename that folder once by hand; nothing else about
  plugins changes.

### New

#### New node: Handler Function
Routes now attach to a **Handler Function** node instead of embedding a handler inline.
A Handler Function is a named handler you can write as plain code or as its own visual
blueprint graph, and — because it's a standalone node — the same one can be reused
across multiple routes, or chained to another Handler Function to run several in a row
on one route (call `next()` to hand off to the next one; the last handler in the chain
owns the response).

- **Code or blueprint mode**, same toggle Function nodes already have.
- **Async Handler** checkbox, for using `await` inside the handler.
- Can read and write **module-level variables** from the main canvas, not just its own
  local ones, when authored in blueprint mode.

**Use case**: Attach the same "require login" handler to several different routes
without copy-pasting it, or split one route's work into a chain of small, named,
independently reusable handlers instead of one long inline block.

See the [Handler Function reference](/node-reference/logic#handler-function--logichandlerfunction)
and the updated [Routing reference](/node-reference/routing).

#### Module Variables, editable from inside a blueprint graph
A Function's or Handler Function's blueprint graph now shows a second **"Module
Variables"** panel alongside its own local Variables panel, listing the main canvas's
variables. Drag one onto the graph to read or write it, exactly like a local variable —
and any change you make here (add, rename, remove, retype) shows up on the main canvas
immediately, since it's the same underlying list.

**Use case**: Read or update shared, app-wide state (like a counter or a cached config
value) from inside a handler's or function's own visual logic, without leaving that
graph to go find the variable elsewhere.

#### Write only the files you want to disk
The "Compiled Project" preview now has a checkbox next to every file (plus a "Select
All"), so you can write just the files you actually changed to disk instead of only
"Write All to Disk."

**Use case**: Review a multi-file compile, then persist only the handful of files you're
confident about — the rest keep their existing on-disk content.

### Improved

- **Themed checkboxes and scrollbars.** Every checkbox in the app (config panels, the new
  per-file selection above, canvas boolean pins) and every scrollable panel now match the
  app's dark theme instead of showing the browser's default light styling.

### Fixed

- **The right-click node picker could appear cut off**, showing fewer results than fit
  the available space. It now sizes itself correctly to the space it actually has.
- **The Browse Nodes modal's cards could visually overlap** each other slightly. Spacing
  is fixed so every card has clean room around it.
- **Long node names in Browse Nodes/the node picker didn't truncate properly** and could
  push a node's "Plugin" badge out of place. Long names now truncate with an ellipsis as
  intended.
- **Searching the node picker or Browse Nodes for a term like "callback" also returned
  unrelated results** (e.g. array nodes that merely mentioned a similar word). Search now
  matches names/descriptions that *start with* your search term, giving more focused
  results.

### Documentation

- New [Handler Function reference](/node-reference/logic#handler-function--logichandlerfunction)
  entry; the [Routing reference](/node-reference/routing) and [Handler
  reference](/node-reference/handler) pages are updated for the new attach-a-Handler-
  Function model. The [Node Categories](/core-concepts/node-categories) and [Node
  Reference overview](/node-reference) pages now list Handler Function in place of the
  removed Custom Code handler node.
- [Function Graphs & Blueprint Mode](/core-concepts/function-graphs-and-blueprint-mode)
  now describes the Module Variables panel.
- [Environment Variables](/configuration/environment-variables) and [Project
  Directory](/configuration/project-directory) are updated for the `VISUAL_NODE_PROJECT_DIR`
  and `.visualnode/plugins/` renames.

---

## Version 0.5.0

### New

#### Functions as values
A Function node's output can now be wired out as a value — not just called directly.
Assign it to a variable, or pass it straight into another node as an argument, the same
way you'd wire any other value.

**Use case**: Pass a function around and decide later where and how it gets called,
instead of only being able to call it in place.

#### New node: Callback
A new **Callback** node calls a wired-in function reference with however many arguments
you give it, and captures the result. Grow or shrink the argument list directly on the
node with the **"+ Add Arg"**/**"×"** buttons.

**Use case**: Invoke a function that was handed to you as a value — for example, one
stored in a variable or passed in from elsewhere — without knowing in advance which
function it'll be.

#### Function node: choose how it's used
The Function node's config panel gained a **Usage** toggle:

- **For Calling / Callback** — shows the function as a wireable value (so it can be
  passed to a Callback node or stored in a variable) and hides the plain "call it
  directly" execution pin.
- **Standalone Function** — the original behavior: a plain callable function, wired
  directly into an Export node or a Function Call.

Function parameters can also now have **default values** — typed directly on the pin or
wired in from elsewhere — so a parameter left unset at the call site still gets a
sensible value.

**Use case**: Keep a Function node's on-canvas pins focused on however you're actually
using it, instead of showing every possible pin all the time.

### Improved

- **Function graphs now open in a tab, not a popup.** Double-clicking a blueprint-mode
  Function node (or its "Open Blueprint Graph" button) opens that function's visual
  graph in its own tab next to "Main Graph" — the same way a code editor handles
  multiple open files. Open several function graphs at once, switch between them
  instantly, and use the new **◀ / ▶** buttons to step back and forth through recently
  visited tabs. Every edit now saves itself automatically as you make it — there's no
  more Save/Save & Close/Cancel step, and nothing is lost by simply switching tabs or
  closing one.
- **Smoother dragging on the canvas.** Moving nodes around — especially in larger flows
  with many nodes and wires — no longer stutters.
- **Faster to open, and smoother to browse.** The editor now loads faster on first
  open, and the node browser/right-click node picker scroll smoothly even with 100+
  node types to search through.

### Documentation

- New [Callback node reference](/node-reference/logic#callback--logiccallback) entry,
  and the [Function node reference](/node-reference/logic#function--logicfunction) entry
  has been updated for the Usage toggle, wireable function output, and default parameter
  values.
- The [Node Categories](/core-concepts/node-categories) and [Node Reference
  overview](/node-reference) pages now list the Callback node.
- [Function Graphs & Blueprint Mode](/core-concepts/function-graphs-and-blueprint-mode)
  now describes the tab-based editing experience.

---

## Version 0.4.1

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

### Coming from before Version 1.0.0

Version 1.0.0 has three breaking changes — everything from Version 0.5.0 downward is
still fully backward compatible on its own.

1. **Replace every Custom Code handler with a Handler Function.** For each route using
   the old `handler.customCode` node:
   - Add a **Handler Function** node and paste the old handler's code into its
     **Function Body** field.
   - Give it a name, wire the Route's output into the Handler Function's **Attach**
     input, and delete the old Custom Code node.
   - If the old handler had **Async Handler** checked on the Route, check **Async
     Handler** on the new Handler Function instead — Routes no longer have their own
     Async setting.
2. **Rename the `FLOWSERVER_PROJECT_DIR` environment variable** to
   `VISUAL_NODE_PROJECT_DIR` anywhere you set it (shell profile, scripts, CI).
3. **Rename the `.flowserver/` folder** to `.visualnode/` inside any existing project
   directory that has plugins installed, so they keep loading.

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
7. Switch a Function node's **Usage** to "For Calling / Callback," wire its output into a
   new **Callback** node, and give the Callback whatever arguments it needs.
8. Open a blueprint-mode Function's graph and try the new tab bar — open a few at once
   and use **◀ / ▶** to jump between them.
9. Attach a **Handler Function** to a route, then chain a second one off its **Next**
   output to see multiple handlers run in sequence.
10. Open a Function's or Handler Function's blueprint graph and check the new **Module
    Variables** panel to read/write a main-canvas variable without leaving the graph.
11. After compiling a multi-file project, use the per-file checkboxes in the preview
    modal to write only the files you want to disk.
