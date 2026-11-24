# paperclip.merge-control-hotspots

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov; MERGER.md §4 rule 12

When a candidate shares `pnpm-lock.yaml`, the root `package.json`, `turbo.json` or a file under `.github/workflows/` with a queued pull request or one added earlier in the pass, or changes more than 100 files, the plugin shall not enqueue it.

## Examples

- Given a queued pull request that changes `pnpm-lock.yaml` and `src/index.ts`,
  when candidates changing each of them are checked,
  then only the one changing `src/index.ts` is enqueued.
- Given two candidates changing the same workflow file,
  when a pass runs,
  then only the first is enqueued; one changing 140 files waits to be queued by hand.
