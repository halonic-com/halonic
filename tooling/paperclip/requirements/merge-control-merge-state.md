# paperclip.merge-control-merge-state

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); MERGER.md §4 rules 10–11; C7 (board, 21 Nov 21:05); HAL-18304 (board, 25 Nov 08:22); HAL-18470 (the live Merger since 25 Nov 12:02 UTC)

When the gate checks a pull request, the plugin shall require a non-draft pull request labelled `built-on:paperclip` or `built-on:halonic`, both alike, based on `main`, mergeable, with its branch in the repository's own organisation, and shall comment once per pull request on one whose branch is elsewhere.

## Examples

- Given a stacked, conflicting or not yet computed pull request,
  when a pass runs,
  then it isn't enqueued.
- Given a pull request from a fork,
  when two passes run with different heads,
  then it isn't enqueued and the note is posted once.
- Given the same pull request labelled `built-on:halonic` and labelled `built-on:paperclip`,
  when the gate checks it, green, unapproved, red, label-noop, conflicting or as a draft,
  then both get the same verdict and the same actions; with neither label it isn't enqueued.
- Given a `built-on:halonic` pull request with `fast-track`,
  when a pass runs,
  then it goes first only when a configured labeller added `fast-track`, and jumps only under the normal rule; from anyone else or nobody known it is queued normally.
