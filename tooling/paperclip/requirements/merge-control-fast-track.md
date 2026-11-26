# paperclip.merge-control-fast-track

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-15971; HAL-17697 (board, HAL-10, 24 Nov 17:36); MERGER.md "Fast-track PRs"; HAL-17762; HAL-19481 (2.3 of the plan on HAL-19228)

When a candidate carries `fast-track` added by the board's queue login from the plugin's config (never by `halonic-dev`, the account every agent posts as), the plugin shall enqueue it before the others and past the fill target, with a jump only when more than 8 entries are queued and no fast-track pull request is queued or added in the pass, shall never take a queued pull request out to jump it again, and shall log a label added by anyone else.

## Examples

- Given labels by the board's login, by someone else and by nobody known,
  when a pass runs,
  then the first goes first and the others are logged as unverified.
- Given a normal pull request with a board boost of 60,000 and a ready fast-track one,
  when a pass runs,
  then the fast-track one goes first.
- Given a full queue and two ready fast-track pull requests,
  when a pass runs,
  then both are enqueued.
- Given 9 entries queued and two fast-track candidates,
  when a pass runs,
  then only the first jumps; with 8 entries, or a fast-track pull request already queued, none does.
