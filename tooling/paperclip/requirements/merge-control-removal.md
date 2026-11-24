# paperclip.merge-control-removal

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov ~15:00 and 20:12, 21 Nov 18:55, 22 Nov 17:32; MERGER.md §4 "Removing queued PRs"

When a pull request is in the merge queue, the plugin shall take it out only for a board hold, a branch outside the repository, a moved head after approval, a change request, no signed approval on its head, a conflict with `main`, or 15 minutes unmergeable in the queue, each with the Merger's comment, and never for a pending check.

## Examples

- Given a queued pull request with a pending `ci-ok` and a missing workflow run,
  when a pass runs,
  then it stays queued.
- Given queued pull requests that conflict, moved head, lack a signed approval, come from a fork and are held by the board,
  when a pass runs,
  then each is dequeued with its reason.
- Given an entry unmergeable in the queue,
  when it has been so for 16 minutes,
  then it is dequeued and cools down behind the entries that were ahead of it.
