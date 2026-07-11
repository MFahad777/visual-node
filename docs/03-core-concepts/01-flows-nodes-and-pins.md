---
title: Flows, Nodes, and Pins
---

# Flows, Nodes, and Pins

A **flow** is a graph: a set of **nodes** connected by **edges** (wires). Each node has a
**type** (like `express.route` or `handler.sendJson`) that determines its ports and what
code it generates; a node's own settings live in its **config fields**, edited in the
side panel when it's selected.

## Two kinds of pins

Every port on a node is one of two kinds:

- **Execution pins** (`kind: "exec"`) — rendered as a **white arrowhead**. These represent
  *sequential control flow*: "after this node runs, run that one next." A Route's
  handler chain, a Function's body, and Branch/Switch's arms are all wired together with
  exec pins.
- **Value pins** (`kind: "value"`) — rendered as a **colored circle** (colored by the
  node's category — see [Node Categories](/core-concepts/node-categories) — except a
  variable's Get/Set pins, which are colored by the variable's own data type). These
  carry an actual JavaScript value: a request body, a computed sum, a boolean condition.

:::info The legacy `"in"`/`"out"` convention
Node types added before operators/control-flow (Phase 7) don't set `kind` explicitly at
all — the editor infers exec vs. value purely from the port id: a port literally named
`"in"` or `"out"` renders as an exec pin, anything else renders as a value pin. Both
conventions coexist in the registry; you never need to think about this as a user, but if
you're reading `packages/core`'s source alongside these docs, that's why some
`PortDefinition`s have an explicit `kind` and others don't.
:::

## Unwired value pins: literals

A value pin that isn't wired to anything usually isn't an error — most of them let you
type a literal directly into the pin (or, for a few special cases like `express.route`'s
config fields, into a proper form field in the side panel instead). If a pin has neither
a wire nor a literal and the node requires one, compiling fails with a clear error naming
the node and the missing pin — visual-node refuses to silently emit broken code.

## Structural vs. handler nodes

Nodes fall into two broad roles in how they're compiled:

- **Structural nodes** (`server`, `routing`, `middleware` categories, plus any
  unconditionally-emitted `logic` node like `logic.function`/`logic.begin`) are
  topologically sorted and always emitted at the top level of the generated file.
- **Handler-chain nodes** (wired off a Route's "Handler" output, or a Function's body)
  are walked in wire order and assembled into that owning node's body — they're never
  emitted at the top level on their own.

See [How Code Generation Works](/core-concepts/how-codegen-works) for the full picture,
including how Branch/Switch and pure value nodes fit in.

## Working with the canvas

The visual editor provides several tools to organize and document your flows without
changing any generated code.

### Multi-select and group operations

Hold Shift and left-click-drag to draw a selection box on the canvas. Every node the box
touches is highlighted. Once selected, you can:

- **Drag any selected node** to move the entire group together, preserving relative positions.
- **Press Delete or Backspace** to remove all selected nodes and their connected wires at once.
- The config panel shows an empty state when 2+ nodes are selected, matching the behavior
  when nothing is selected at all.

### Reroute anchors on wires

Double-click anywhere along a wire to drop a draggable anchor point. This bends the wire's
rendered path without changing any logic or generated code — it's purely a canvas-routing aid
to reduce visual clutter.

- **Drag an anchor** to reposition it.
- **Double-click an anchor** or select it and press Delete to remove it.

Anchors work on the main canvas and inside Function/Handler-Function blueprint graphs.

:::info Anchors don't affect generated code
Reroute anchors are a visual-only feature. The generated code has no knowledge of them —
wires always compile exactly the same regardless of how you've rerouted them on canvas.
:::

### Node comments

Every node displays a small comment bubble icon in its top-right corner when selected.
Click the icon to open a text editor where you can add a note. Your comment:

- Renders as a persistent text block above the node on the canvas while you work.
- Is included automatically as a documentation comment block in the generated code (e.g.,
  `/** Your comment text here */` above the node's output).

Comments work on the main canvas and inside Function/Handler-Function blueprint graphs.

### Comment group boxes

Press `C` with one or more nodes selected to wrap them in a resizable, colored box. The
box is a first-class canvas element:

- **Drag the box** to move all contained nodes together (via React Flow's native parent/child
  composition — dragging the parent automatically translates every child).
- **Double-click the box title** to rename it (or edit the title initially when the box is created).
- **Right-click the box** to open a color picker and choose any color from a built-in palette.
- **Press Delete** with the box selected to remove it (contained nodes are released and stay behind).

Comment boxes work identically on the main canvas and inside Function/Handler-Function
blueprint graphs, and reroute anchors on connected wires automatically follow moved nodes
so your wire routing is preserved.
