# paperclip.merge-control-change-request

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov 21:25 and 22 Nov 17:32; MERGER.md §4 rule 6; HAL-17946; Julian's [major] on HAL-19649 (HAL-19778)

When Liam's, Julian's or Nora's change request ("changes requested", "needs a fix", "please fix", "blocking" but not "non-blocking" or "not blocking", "do not merge", or a signed line naming a head that rejects it, also in a comment that holds an approval line) has neither a later approval of the head by the same reviewer nor a push after it with the counted approval given after that push, the plugin shall keep the pull request out of the queue and take it out if it is queued.

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
- Given "Liam: approved on head X", then "Liam: changes requested on head X", then "Nora: approved on head X" (or Julian's),
  when a pass runs,
  then it isn't enqueued; a later "Liam: approved on head X", or a push after the request and a new approval, lets it in.
- Given a change request and an approval of head A, both from before a rebase-only push to head B (an identical diff),
  when a pass runs,
  then it isn't enqueued: the approval carried over from before the push doesn't clear the request.
