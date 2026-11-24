# paperclip.merge-control-live-cloud

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14858; MERGER.md §4 rule 9

When a candidate is about to be enqueued, the plugin shall require its head's `live-cloud` check to have passed once, or its newest run to be skipped, or to have none, and otherwise keep it out with one comment per head "Waiting for the live cloud suites to pass on this head (`live-cloud` check).".

## Examples

- Given a running `live-cloud` check,
  when two passes run,
  then it isn't enqueued and the comment is posted once.
- Given a pass after a failure, a newest skipped run or no run,
  when it is checked,
  then it lets the pull request in; when the checks can't be read, it waits.
