# paperclip.merge-control-merge-state

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); MERGER.md §4 rules 10–11; C7 (board, 21 Nov 21:05)

When the gate checks a pull request, the plugin shall require a non-draft `built-on:paperclip` pull request based on `main`, mergeable, with its branch in the repository's own organisation, and shall comment once per pull request on one whose branch is elsewhere.

## Examples

- Given a stacked, conflicting or not yet computed pull request,
  when a pass runs,
  then it isn't enqueued.
- Given a pull request from a fork,
  when two passes run with different heads,
  then it isn't enqueued and the note is posted once.
