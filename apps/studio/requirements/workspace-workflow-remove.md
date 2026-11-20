# studio.workspace-workflow-remove

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, removing steps and arrows); UX checklist 10.10; flow-workflows 4.6; save model (HAL-1300); states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature removes a step, the desktop app shall take out of the workflow's file the step with its own arrows, its place in `layout`, and every other step's arrows into it, taking out a step's `on` list when no arrow is left in it, and give how many arrows went. When the feature removes an arrow, the desktop app shall take it out of its step's `on` list, taking out the list with its last arrow. Each shall be one undoable change of the workspace's files that keeps the file's comments, and shall hand back an undo that is the workspace's undo while the removal is still the newest change; after any other change the undo shall be refused with "<Step draft | The arrow> can't be put back, because the workspace changed after it was removed." and undo nothing. It shall refuse, and write nothing, the first step ("This is the first step. Pick another first step in Configuration › General before removing it."), a workflow or step that isn't there, and an arrow that isn't there.

## Examples

- Given `sort` (first) with arrows to `approve` and `draft`, `approve` with an arrow to `draft`, and `draft` with a place and an arrow to `done`, when `draft` is removed, then 3 arrows went, `sort` keeps its arrow to `approve` and the comment above it, `approve` has no `on` list and `layout` has no `draft`.
- Given that removal, when its undo runs at once, then the file is as it was; when another change came first, then the undo is refused and the file stays.
- Given `sort`, then removing it is refused as the first step, and nothing is written.
- Given `sort`, when its second arrow is removed, then it keeps the first with its comment, and undo puts the second back.
- Given `draft` with one arrow, when it is removed, then `draft` has no `on` list.
- Given `sort` with two arrows, then removing a third, or an arrow of `done`, is refused and nothing is written.
