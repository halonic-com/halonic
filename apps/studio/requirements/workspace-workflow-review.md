# studio.workspace-workflow-review

- Status: active
- Since: unreleased
- Source: HAL-16806 (T14 PR 14b); AI changes 1.2 (changes to review on an item page), review panel notes 1 and 4; HAL-1307 plan, T14

When the Workflows feature asks the desktop app for the assistant's changes to review in a workflow's file, the app shall read them the way `studio.workspace-agent-review` reads an agent's, with one change per workflow field and per step as `describeWorkflowChange` names them, and with the same whole-file changes, `stale`, `held` and undo. Each change shall name the changes it can't be kept without, such as the step a changed arrow now goes to. Accepting a change shall accept the changes it needs too, and rejecting a change shall reject the changes that need it too, so no decision leaves the workflow pointing at a step that isn't there. The app shall find the workflow's file by its hub and id, and refuse a workflow that isn't there.

## Examples

- Given the assistant renamed the workflow `reply` and put a new step `check` between `draft` and `done`,
  when the feature reads its changes,
  then it gets "Name", the change to `draft` and the added step `check`, and the change to `draft` needs `check`.
- Given those changes,
  when the person rejects the added step `check`,
  then the file has neither `check` nor the arrow from `draft` to it, and only the name change is left to review.
- Given those changes,
  when the person accepts the change to `draft`,
  then the step `check` is accepted too, and only the name change is left to review.
- Given the workflow `gone` isn't in the workspace,
  when the app looks for its file,
  then it refuses.
