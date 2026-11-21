# studio.workspace-workflow-arrow-fields

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, arrow editing); UX checklist 10.9 (the expanded row); flow-workflows 5.3; save model (HAL-1300); states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature sets one field of a step's arrow (its target, event, timer, condition or label), the desktop app shall write it at that arrow's key in the file (`to`, `event`, `after`, `when`, `label`) as one undoable change of the workspace's files named "Changed an arrow of step <step> in workflow <name>", keeping the file's comments. Setting a field to none, or the event to `done`, the format's default, shall take its key out. Setting a timer shall take the arrow's event out. It shall refuse, write nothing and say why in a sentence, a change after which the file no longer reads as a workflow (a time such as "soon", a condition the format doesn't know), an arrow to a step that isn't there, and an arrow that isn't there. The rules between steps, such as timers only on waits, stay the Problems page's, as for any other edit.

## Examples

- Given `sort`'s second arrow, when its target is set to `done`, its event to `skipped`, its condition to `{ exists: context.summary }` and its label to "Nothing to reply", then four changes are written, the comment above the first arrow stays, and reading gives the arrow with all four.
- Given `sort`'s first arrow with a condition, when its condition is set to none, then the file has no `when:`; given `approve`'s arrow on `approved`, when its event is set to `done`, then the file has no `event:`.
- Given `approve`'s arrow on `approved`, when its timer is set to `4h`, then it has the timer and no event.
- Given `approve`'s timer arrow, when its timer is set to `soon`, then the change fails with a sentence; a condition `{ maybe: true }`, the step `gone` and a third arrow of `sort` fail too, and nothing is written.
