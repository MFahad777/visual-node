---
title: Diagnostics & the Problems Panel
---

# Diagnostics & the Problems Panel

Every issue the editor finds in your flow — whether it's caught while you're editing or
during a full project "Compile" — shows up in the **Problems** panel at the bottom of the
screen. Each entry is one **diagnostic**: a message, a severity, and (when it applies) the
exact node it's about.

## Errors vs. warnings

Diagnostics come in two severities, shown with a distinct icon and color:

- **⊗ Errors** (red) — block compiling and generating code. Fix these before you can
  produce output.
- **▲ Warnings** (amber) — informational only. Your flow still compiles and generates code
  normally; a warning just flags something that's probably unfinished or worth a second
  look.

**Example**: a **Branch**, **Switch**, **Try Catch**, or **Sequence** node with none of
its execution outputs wired to anything used to be a hard error. It's now a warning — the
flow still compiles (that fork simply does nothing at runtime), but the Problems panel
still calls it out so you don't forget to finish wiring it.

## Human-readable messages

Diagnostic messages name nodes the way you'd recognize them on canvas, not by their
internal id:

- A **Get Variable**/**Set Variable** node shows the variable's actual name, e.g.
  `Get "counterName"` — or `Get "Unknown Variable"` if it's bound to a variable that no
  longer exists.
- A **Function** or **Handler Function** node shows the name you gave it, or
  `"Unnamed Function"`/`"Unnamed Handler Function"` if you haven't named it yet.
- Diagnostics from inside a nested graph show a full **breadcrumb** of every Function/
  Handler-Function/Promise you'd have to open to reach the offending node — for example
  `MyFunction › InnerPromise › Get "counterName"` — so you always know where the problem
  actually is, no matter how deeply nested it is.

## Click a diagnostic to jump straight to it

Click any row in the Problems panel and the editor:

1. Opens the right file, if the diagnostic came from a different one (e.g. a whole-project
   Compile).
2. Opens every intermediate Function/Promise/Handler-Function tab along the breadcrumb, in
   order, until it reaches the tab that actually contains the node.
3. Selects the offending node and pans/zooms the canvas so it's centered and visible.

This works at any nesting depth — a problem three Promises deep inside a Function still
takes you directly to it, opening each tab along the way.

## Warnings are visible on canvas too

A node with only warning-level diagnostics gets a subtle **amber ring** around it (instead
of the red ring used for a node with an actual error), so you can spot an unfinished
fork node at a glance without having to open the Problems panel first.
