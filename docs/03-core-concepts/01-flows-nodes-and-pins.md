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
