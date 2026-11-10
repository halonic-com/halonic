# check.guard-approval-fails-closed

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3); signatures since HAL-1337

If the requirement guard isn't given the pull request's repo, number, head commit and base commit, or can't read either commit, then it shall treat every decision note's approval as not verified.

## Examples

- Given a well-formed, correctly signed note that lists the change,
  when the guard runs without the pull request's number,
  then the approval is not verified and the guard fails.
- Given the same note,
  when the guard's git repo doesn't have the base commit,
  then the approval is not verified.
