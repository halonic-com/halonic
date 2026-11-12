# check.guard-user-review

- Status: active
- Since: 0.1.0
- Source: HAL-1337

When the guard checks a `user-visible` decision note that has no `- Signature:` line, the guard shall verify its approval only if the guard's own code, as the base branch has it, pins a GitHub account by numeric user ID, and that account's latest review of the pull request that isn't a plain comment is an approval made on the pull request's current head commit, read live from GitHub, and the base branch doesn't already have the note.

## Examples

- Given a `user-visible` note with no signature line and an approving review by the pinned account on the head commit,
  when the guard checks it,
  then the approval is verified.
- Given the same review on an older commit, because the branch was pushed again,
  when the guard checks it,
  then the approval is not verified.
- Given an approval that the account dismissed or replaced with a later request for changes,
  when the guard checks it,
  then the approval is not verified, and a later plain comment changes nothing.
- Given an approving review by an account that the guard's code doesn't pin, or that only the pull request's own `approvers.json` lists,
  when the guard checks the note,
  then the approval is not verified.
- Given a guard that has no token, or GitHub fails to list the reviews,
  when it checks the note,
  then the approval is not verified.
