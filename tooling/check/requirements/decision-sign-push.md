# check.decision-sign-push

- Status: active
- Since: unreleased
- Source: HAL-17893

When an approver runs `pnpm decision sign <pull request number> --push`, the tool shall add the `- Signature:` line to the note at the pull request's head (in place of the approver's own old line, under the last signature line, or under the `- Kind:` line), commit only that change as `halonic-dev` on top of the head without checking the pull request out, and push it to the pull request's branch without force; it shall refuse to push for a pull request from a fork.

## Examples

- Given an unsigned note,
  when the CTO signs it with `--push`,
  then the new commit changes only the note, which has the line under `- Kind:`, and its parent is the head that was signed.
- Given a note the CTO signed for a trust-root change,
  when the security reviewer signs it with `--push`,
  then the second line goes under the first.
- Given a note whose CTO line no longer matches,
  when the CTO signs it with `--push`,
  then the new line takes the old line's place.
- Given a branch that moved after the head was read,
  when the tool pushes,
  then the push fails, because it never forces.
