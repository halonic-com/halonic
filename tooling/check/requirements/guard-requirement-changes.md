# check.guard-requirement-changes

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 2)

If a pull request edits, retires, demotes, renames or deletes a requirement that is active on the merge base, then the requirement guard shall report the change under the requirement's ID.

## Examples

- Given the active requirement `workflow.timer-fires` on the merge base,
  when the pull request sets its status to retired,
  then the guard reports that `workflow.timer-fires` was retired.
- Given the same requirement,
  when the pull request moves its file to `requirements/timer-goes-off.md`,
  then the guard reports that it was renamed to `workflow.timer-goes-off`.
- Given a draft requirement on the merge base,
  when the pull request edits it,
  then the guard reports nothing.
