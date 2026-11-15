# workflows.canvas.auto-layout

- Status: draft
- Since: 0.1.0
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.2; states C2, C3

When a workflow's steps have no saved place, the workflows feature shall put the first step on top and each step below the step that leads to it, side by side when several steps share a row, and keep the place of any step the person has already moved.

## Examples

- Given `start → done`, then `start` is on top and `done` is one row below it, in the same column.
- Given `start` leads to `a` and `b`, then `a` and `b` share the row under `start`, side by side in the file's order.
- Given an arrow from `b` back to `start`, then `b` stays where it was; the arrow doesn't move it up.
- Given a step the first step can't reach, then it goes in a row of its own below the others.
- Given the person moved `done` to a place, then the layout keeps it there and places only the other steps.
