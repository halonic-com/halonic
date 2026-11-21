# studio.workspace-workflow-arrows

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, arrow editing); UX checklist 10.9; flow-workflows 4.3, 5.3; save model (HAL-1300); states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature reads a workflow, the desktop app shall give each arrow its event (none for `done`), its timer and its condition as the file gives them, step by step in the file's order and each step's arrows in the order its file lists them. When the feature adds an arrow out of a step, the desktop app shall add `{ to }` (on done) after the step's other arrows, making the step's `on` list when it has none; when it moves an arrow one place up or down, it shall take the arrow out and put it back with only the keys its file gives it. Each shall be one undoable change of the workspace's files that keeps the file's comments. It shall refuse, and write nothing, a workflow or step that isn't there, an end step, an arrow to a step that isn't there, an arrow that isn't there or would move off the list, and a move whose arrow no longer goes to the step the move names.

## Examples

- Given `sort` with an arrow to `approve` if `category` is `refund` and one to `draft`, then reading gives both in that order, the first with its condition and neither with an event.
- Given `approve`, a wait step, then reading gives its arrow to `draft` on `approved` and its arrow to `done` after `2d`.
- Given `sort`, when an arrow to `done` is added, then it is `sort`'s third arrow, the comment above the first stays, and no `event: done` is written.
- Given a step with no `on` list, when an arrow to `done` is added, then the step has that one arrow.
- Given `sort`, when its first arrow is moved down, then `draft` comes first and the arrow to `approve` keeps its condition; moving it up again puts it back.
- Given `sort` with two arrows, then adding an arrow to `gone` or one out of the end step `done`, moving the first up, the second down or a third anywhere fails, and nothing is written.
- Given `sort` after its second arrow was moved up, when a move of arrow 2 to `draft` comes again, then it fails, because arrow 2 now goes to `approve`.
