# paperclip.merge-control-stale-runs

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov ~15:20; MERGER.md §5

When a queued merge-group run less than a day old belongs to no current group, or a queued pull request run is on a head its open pull request has moved past, the plugin shall cancel it.

## Examples

- Given queued group runs for a current group, a gone group and a gone group 25 hours ago, and queued pull request runs on the head, an old head and a closed branch,
  when a pass runs,
  then only the gone group's young run and the old head's run are cancelled.
