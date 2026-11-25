# paperclip.merge-control-label-noop-reopen

- Status: active
- Since: unreleased
- Source: HAL-18470; the live Merger since 25 Nov 12:02 UTC (HAL-18424, Chief's yes 25 Nov 11:30)

When the gate says `label-noop` on the current head of an approved, unqueued, non-draft candidate, the plugin shall post one comment without `@` names, then close and reopen the pull request, at most once per head; when it already reopened another head of that pull request within a day, it shall not reopen it and shall log `LABEL_NOOP_LOOP` instead, and it shall forget reopens after 2 days.

## Examples

- Given an approved pull request whose head shows `label-noop`,
  when two passes run,
  then the first posts the comment, closes and reopens it, and logs `labelNoopReopened=`; the second does nothing.
- Given an unapproved, queued, draft or green pull request,
  when a pass runs,
  then it isn't reopened.
- Given a reopen of another head of the same pull request 23 hours ago,
  when a pass runs,
  then it isn't reopened and the log says `LABEL_NOOP_LOOP`; after 25 hours it is.
- Given reopens older than 2 days,
  when a pass runs,
  then they are dropped.
- Given the reopen write fails once,
  when the action runs,
  then the reopen is sent once more, after the comment and the close.
