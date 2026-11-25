# paperclip.merge-control-julian-scope

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14809; MERGER.md §4 rules 4–5; HAL-18459, Julian's rebase-only re-approval on any pull request

When Julian's signed approval is the only one on the head, the plugin shall count it only when `reviewerFor` says `julian`, the pull request is not on a `julian/` or `changeset-release/` branch, and no change request by Liam is newer than the last push. Outside Julian's limits it shall also count Julian's "re-approved on head `<new>` (rebase only, range-diff vs `<old>`)" when Liam signed an approval of `<old>`, every changed file is known, the pull request isn't on a `liam/` branch, and `julianRebaseRefusal` in `reviewer-paths.ts`: not a security pull request by its paths (`isSecurityPath`), not on a `changeset-release/` or `julian/` branch; no change request by Liam may be newer than the last push.

## Examples

- Given Julian's approval on a pull request within his limits,
  when a pass runs,
  then it is enqueued.
- Given Julian's approval on one that changes `turbo.json`, on a `julian/` branch or on a `changeset-release/` branch,
  when a pass runs,
  then it isn't enqueued.
- Given Liam's approval of `<old>` and Julian's "re-approved on head `<new>` (rebase only, range-diff vs `<old>`)" on one that changes `pnpm-lock.yaml`,
  when a pass runs,
  then it is enqueued; the same on one that changes `packages/x/src/sandbox/fence.ts`, on a `changeset-release/` branch, with files not listed, or without Liam's approval of `<old>` isn't.
- Given Liam's change request after the last push and Julian's later approval,
  when a pass runs,
  then it isn't enqueued.
