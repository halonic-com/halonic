# paperclip.merge-control-change-request

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov 21:25 and 22 Nov 17:32; MERGER.md §4 rule 6

When Liam's or Julian's newest change request ("changes requested", "needs a fix", "please fix", "blocking" but not "non-blocking", "do not merge", or a signed line naming a head that rejects it) is newer than the head's approval, the plugin shall keep the pull request out of the queue and take it out if it is queued.

## Examples

- Given an approval and a later "needs a fix" by Julian,
  when a pass runs,
  then it isn't enqueued.
- Given an approval that says the blocking point is fixed, or a later non-blocking note,
  when a pass runs,
  then it is enqueued.
- Given a queued pull request with a new change request,
  when a pass runs,
  then it is dequeued with the reason change request.
