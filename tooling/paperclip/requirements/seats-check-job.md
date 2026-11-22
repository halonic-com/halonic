# paperclip.seats-check-job

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.check` only proposes moves, posted on a task, in the supervision plugins plan on HAL-15997 (phase 3); Liam's review notes on #5073, #5121 and #5174

While the `seats` plugin runs, `seats.check` shall every 10 minutes propose seat moves for the one company whose settings list the seats, post the proposal on the task the board set only when its moves or reset advice differ from the last one posted, and move no agent; the plugin shall keep manual resets when it removes old rows, and record at most one manual reset per reset group.

## Examples

- Given an agent on a seat at 85% of its 5-hour window and a pool seat with room,
  when `seats.check` runs,
  then it posts the move on the board's task and changes no agent's settings.
- Given the same moves at the next run, with the seat now at 86%,
  when `seats.check` runs,
  then it posts nothing.
- Given moves that went away and came back,
  when `seats.check` runs,
  then it posts them again.
- Given no task set for proposed moves,
  when `seats.check` runs,
  then it reads nothing and posts nothing.
- Given a manual reset recorded 30 days ago,
  when old rows are removed,
  then it stays.
- Given a manual reset recorded for seat A, which shares reset group G with seat B,
  when a board user records a manual reset for seat B,
  then the plugin refuses with 409 and stores nothing.
