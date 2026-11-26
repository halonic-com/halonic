# paperclip.board-mentions

- Status: active
- Since: unreleased
- Source: HAL-19667 plan (Liam approved, 26 Nov), board-approved design on HAL-19491 (row "comment"); task HAL-19669

When a new comment links a person with Paperclip's mention link `[Name](user://<userId>)`, the Agent tools plugin shall keep the comment's id, its task's id, at most 20 of the mentioned user ids and its time for 14 days, and no text. The plugin shall answer `GET /board/mentions?since=<iso>` for a signed-in person only (403 for an agent's key) with the kept comments that mention that person on tasks that are not done or cancelled, newest first, at most 100, from the last 14 days and not before `since`: each with its id, task id, task identifier and title, author, time, at most 2,000 characters of its text and when that person last commented on the task (`repliedAt`, `null` if never). The plugin shall never count a comment as a mention because its text contains a name or the word "board", and shall leave out a comment the person wrote and a deleted comment. The plugin reads tasks and comments with its own rights, not the caller's: on today's board every signed-in person may read every task.

## Examples

- Given Ada's comment on ACME-7 that links `[Board](user://user-board)`,
  when the board reads `/board/mentions`,
  then the answer holds that comment with Ada as author and ACME-7's title.
- Given a comment on ACME-7 that says "Board, can you look?" with no mention link,
  when the board reads `/board/mentions`,
  then the answer holds no mention.
- Given Ada's mention of the board on ACME-7 that was deleted later,
  when the board reads `/board/mentions`,
  then the answer holds no mention.
