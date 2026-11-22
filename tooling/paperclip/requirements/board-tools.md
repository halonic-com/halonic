# paperclip.board-tools

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 3 (22 Nov)

When an agent calls `board_asks(since)` or `failed_runs(since)`, the Agent tools plugin shall answer from what the board check kept, since the given ISO time or the last 24 hours: for `board_asks`, each board ask's task, comment id, author, time and link and whether the board or the Board Checker has commented on the task since, newest first; for `failed_runs`, each agent's failed and timed-out runs with their tasks and cause codes and since when it has been counting; with no text from a comment or an error, and with an error for a `since` that isn't a time.

## Examples

- Given asks at 13:10 and 13:40 on HAL-16003 and a Board Checker comment there at 13:20,
  when an agent calls `board_asks` since 13:00,
  then it lists the 13:40 ask as open and the 13:10 ask as answered, each with its link and no comment text.
- Given two of Mateo's runs (`timeout`, `no_identity`) and one of Priya's (`timeout`) on HAL-16003, counted since 09:00,
  when an agent calls `failed_runs`,
  then it answers "Mateo: 2 (timeout 1, no_identity 1) on HAL-16003" and "Priya: 1 (timeout 1) on HAL-16003", counting since 09:00.
- Given `since` "yesterday",
  when an agent calls `failed_runs`,
  then it answers with an error naming the expected form.
