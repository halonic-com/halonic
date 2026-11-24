# paperclip.merge-control-cancelled-reruns

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov ~22:00; MERGER.md §5

While no merge-group job has waited more than a minute for a runner, the plugin shall rerun the CI run of up to 8 open, non-draft, mergeable `built-on:paperclip` pull requests without a change request whose newest `ci-ok` was cancelled, Liam-approved ones first and then the oldest, each head at most once an hour, and never a red one.

## Examples

- Given ten cancelled pull requests, one approved by Liam,
  when a pass runs,
  then 8 are rerun, the approved one first.
- Given a head rerun 30 minutes ago, a red `ci-ok`, a running run or no run,
  when a pass runs,
  then none is rerun.
- Given a runner wait of 1.5 minutes, or one that can't be read,
  when a pass runs,
  then reruns pause.
