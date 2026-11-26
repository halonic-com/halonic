# paperclip.merge-control-nora-scope

- Status: active
- Since: unreleased
- Source: HAL-19248; the board's decision of 26 Nov on HAL-18424 on Nora's scope, as `paperclip.routine-review` sets it; HAL-19283 (one scope rule for the gate, `pr_status` and the PR watcher)

When Nora's signed approval "Nora: approved on head `<sha>`" is the only one that counts on the head, the plugin shall count it only where `paperclip.routine-review` lets the routine reviewer approve alone (`routineRefusal` finds nothing, renamed files counted by their old paths too, the pull request written by the team and not a security or release one), every changed file is known, the pull request is not on a `nora/` or `changeset-release/` branch, and no change request by Liam is newer than the last push. Julian's exceptions don't apply to her: "Author: Liam" doesn't widen her limits, and her rebase-only re-approval doesn't count outside them. Her approval carries over a rebase with an identical diff, as Julian's does. A signed approval by any other name than Liam, Julian or Nora doesn't count. `pr_status` judges her approval by the same `routineRefusal`.

## Examples

- Given Nora's approval on a pull request within the routine reviewer's scope, also on a `liam/` or `julian/` branch,
  when a pass runs,
  then it is enqueued.
- Given Nora's approval on one that changes `packages/core/x.ts`, `packages/host/x.ts`, `packages/testing/spec/x.ts`, `packages/foo/src/index.ts` or any other file `paperclip.routine-review` excludes,
  when a pass runs,
  then it isn't enqueued, while Julian's approval on it is.
- Given Nora's approval on one that changes `turbo.json`, `tooling/check/x.ts` or `pnpm-lock.yaml`, on a `nora/` branch or on a `changeset-release/` branch,
  when a pass runs,
  then it isn't enqueued.
- Given "Nina: approved on head `<sha>`" on a pull request within Julian's limits,
  when a pass runs,
  then it isn't enqueued.
- Given Liam's change request after the last push and Nora's later approval,
  when a pass runs,
  then it isn't enqueued.
