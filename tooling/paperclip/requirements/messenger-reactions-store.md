# paperclip.messenger-reactions-store

- Status: active
- Since: unreleased
- Source: HAL-19139 (board, HAL-10, 26 Nov: react to any message; the board's yes on the card, 26 Nov 12:21 UTC), point 1

The Agent tools plugin shall keep reactions per task in its own state, each with the comment id, one of the emoji 👍 ❤️ 😂 😮 ✅ 👀, who reacted (a user or an agent) and when; shall answer a signed-in board user on `GET /reactions/{taskId}` with `{ reactions }` by comment id (none for a task of another company); and shall, on `POST /reactions/{taskId}` with `{ commentId, emoji, on }`, add (`on: true`) or remove (`on: false`) that board user's own reaction on a comment of that task and answer `{ commentId, reactions }`. Both routes shall answer 403 to anyone but a signed-in board user, 404 for a task id that isn't a UUID, a task the company doesn't have or a comment that isn't on the task, and the write 400 for any other body. A reaction shall never post a comment or wake anyone.

## Examples

- Given the board reacted 👍 to comment `c-1` of a chat task, when Messenger reads `GET /reactions/{taskId}`, then the answer lists `c-1` with that 👍, also after a restart and on the phone.
- Given the board's 👍 on `c-1`, when it posts `{ commentId: "c-1", emoji: "👍", on: false }`, then `c-1` has no reactions and is no longer listed.
- Given an agent's key, when it calls either route, then the answer is 403 and nothing is read or written.
