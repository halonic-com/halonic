# paperclip.merge-control-signed-approval

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14786, HAL-14625; MERGER.md §4 rules 1–2

When the gate checks a pull request's approval, the plugin shall count only a signed "Liam: approved on head `<sha>`" (or "re-approved") line by the team account, or a GitHub approving review on the head that names Liam, that names the current head by at least its first 7 characters and was posted after the head commit and the last force-push, and shall ignore its own queue manager comments.

## Examples

- Given "Liam: approved on head `<first 7 of head>`" posted after the last push,
  when a pass runs,
  then the pull request is enqueued.
- Given the same line posted before a force-push, naming another head, unsigned, or posted by another account,
  when a pass runs,
  then it isn't enqueued.
