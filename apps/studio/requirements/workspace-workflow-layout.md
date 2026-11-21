# studio.workspace-workflow-layout

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 2); HAL-14047 (numbered ids); C544-10 (HAL-15137, HAL-15206); UX checklist 10.4, 10.8 (+ Step, + Wait); flow-workflows 4.2, 5.3; states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature adds a step to a workflow, the desktop app shall add an agent step `step-1` or a wait step `wait-1` (the first free number, from 1, so a card's title never reads "Step step") after the file's other steps, with no arrows of its own, and save its place on the canvas, as one undoable change of the workspace's files that keeps the file's comments. When the feature names the picked step, the same change shall add an arrow on done from it to the new step after its other arrows, unless the picked step ends the workflow or already has an arrow on done without a condition; a picked step the workflow no longer has is refused and nothing is written. When the feature asks for Auto layout, it shall take the saved places out of the file as one undoable change, and write nothing when there are none. It shall refuse a workflow the hub doesn't have.

## Examples

- Given `start → done`, when an agent step is added at (240, 0), then the file has `step-1` after `done`, of the kind task, at (240, 0), in one change, and its comments stay.
- Given a workflow with a wait step `wait-1`, when another wait step is added, then it is `wait-2`.
- Given `sort` with only a conditional arrow, when a step is added after it, then `sort`'s arrows end with one to `step-1` on done, in the same one change, and its comments stay.
- Given `start → done`, when a step is added after `start` or after `done`, then no arrow is added.
- Given a picked step the workflow no longer has, then adding fails and nothing is written.
- Given saved places, when Auto layout is asked for twice, then the file has no `layout` after one change.
- Given a workflow the hub doesn't have, then both fail and nothing is written.
