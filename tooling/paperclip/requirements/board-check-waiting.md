# paperclip.board-check-waiting

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1 part (b) and section 3 (22 Nov)

In the first board-check pass of each hour, the Agent tools plugin shall list every open task that waits on the board (blocked with a board user as assignee or unblock owner, or in review with a board user as assignee or a pending board card), ranked by how many open tasks each holds up directly and through the chain of blockers, longest waiting first on a tie, with each task's identifier, why it waits, the count, since when it waits and who holds it, and no title or comment text; it shall write that list through the write gate to the `board-waiting` document on the Board Checker's task only when it changed since the last hourly pass, and when an agent calls `board_waiting` it shall answer with the list from the last hourly pass and its time.

## Examples

- Given HAL-2 blocked on the board and holding up HAL-4, which holds up HAL-5, and HAL-3 in review with a pending board card holding up nothing,
  when the job runs at 14:00,
  then the `board-waiting` document lists HAL-2 first as holding up 2 tasks and HAL-3 second, with no task titles.
- Given the same tasks,
  when the job runs again at 15:00,
  then it doesn't update the document, because nothing changed.
- Given the same tasks,
  when the job runs at 14:20,
  then it doesn't read blocker links or write the document.
- Given an hourly pass at 14:00 that listed HAL-2,
  when an agent calls `board_waiting`,
  then it answers with HAL-2's line and "as of 2026-11-22T14:00:00.000Z".
