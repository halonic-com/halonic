# remote.phone-session-memory

- Status: draft
- Since: unreleased
- Source: HAL-15179 (tunnel D7, design on HAL-15159, section 3 and section 5 item 10, Julian's finding L2 on HAL-15181)

The phone shall hold each watched session's events in memory only, and at most the last 500 events or 1 MB of event text in UTF-8, whichever comes first, dropping the oldest and recording that it dropped some. It shall keep a session's open approvals apart from its events, so an approval stays open until its `approval-settled` arrives even after its request fell out of the cap, and hold at most 500 of them. It shall resume a session's watch after the last `seq` it holds, or from 0 when it holds none. When an event's `seq` isn't one more than the last one, or the host answers a watch with `history-gone`, it shall drop everything it holds of that session and watch it from 0, ignoring every event of that session until the host confirms the new watch; an event it already has changes nothing.

## Examples

- Given 501 events of a session,
  when the phone holds them,
  then it holds events 2 to 501 and records that older ones were dropped.
- Given 40 events of about 60 KB each,
  when the phone holds them,
  then it holds no more than 1 MB of them, the newest last.
- Given events 1 to 3 and then event 6,
  when the phone takes event 6,
  then it holds nothing of the session and resumes from 0.
- Given events 1 to 3, an approval requested in event 4, and then event 6,
  when events 7 and 8 of the old watch arrive before the host confirms the watch from 0, and then events 1 to 8 arrive,
  then it holds events 1 to 8 and the approval from event 4 is open.
- Given an approval requested in event 1 and 510 events after it,
  when the phone holds them,
  then the approval is still open, until its `approval-settled` arrives.
