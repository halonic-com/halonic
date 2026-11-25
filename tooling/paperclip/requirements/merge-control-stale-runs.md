# paperclip.merge-control-stale-runs

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov ~15:20; MERGER.md §5; HAL-18454 (the 3-minute floor)

When a queued merge-group run at least 3 minutes and less than a day old belongs to no current group, or a queued pull request run is on a head its open pull request has moved past, the plugin shall cancel it.

## Examples

- Given queued group runs for a current group, a gone group and a gone group 25 hours ago, and queued pull request runs on the head, an old head and a closed branch,
  when a pass runs,
  then only the gone group's young run and the old head's run are cancelled.
- Given a group run GitHub queued a minute ago, whose group the queue read doesn't show yet,
  when a pass runs,
  then it is not cancelled (run 45600263634, 25 Nov: #6053's group rebuilt without #6052 went green and merged).
