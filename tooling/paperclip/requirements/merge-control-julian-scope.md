# paperclip.merge-control-julian-scope

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14809; MERGER.md §4 rules 4–5

When Julian's signed approval is the only one on the head, the plugin shall count it only when `reviewerFor` says `julian`, the pull request is not on a `julian/` or `changeset-release/` branch, and no change request by Liam is newer than the last push.

## Examples

- Given Julian's approval on a pull request within his limits,
  when a pass runs,
  then it is enqueued.
- Given Julian's approval on one that changes `turbo.json`, on a `julian/` branch or on a `changeset-release/` branch,
  when a pass runs,
  then it isn't enqueued.
- Given Liam's change request after the last push and Julian's later approval,
  when a pass runs,
  then it isn't enqueued.
