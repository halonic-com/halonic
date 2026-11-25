# paperclip.merge-control-unjudged-hold

- Status: active
- Since: unreleased
- Source: HAL-18324; the board's shadow-against-live comparison on HAL-10 (25 Nov 07:56–08:47 UTC), where the shadow would have enqueued #5768, which the Merger held after its merge group failed on 24 Nov 21:19

When an open pull request outside the merge queue was last taken out of it by GitHub for failed checks after its last push, more than an hour ago, and no pass has judged one of its merge groups created before then, the plugin shall hold its head as a culprit hold until it has a new head, unless the hold was lifted for that head, and shall log that it did; a culprit hold the plugin has stored shall survive a restart of the plugin.

## Examples

- Given #5768 taken out for failed checks 11 hours ago on its head, and no group of it judged,
  when two passes run,
  then it is held on that head with an `UNJUDGED_HOLD` log line, and a new head lets it in.
- Given a pull request taken out for failed checks whose group a pass judged, or whose hold was lifted, or that was pushed since, or taken out for another reason, or taken out less than an hour ago,
  when a pass runs,
  then this rule holds nothing.
- Given a culprit hold stored by one worker,
  when a fresh worker runs a pass two hours later without that group in its facts,
  then the head is still held and not enqueued.
