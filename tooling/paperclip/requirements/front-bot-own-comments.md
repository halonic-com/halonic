# paperclip.front-bot-own-comments

- Status: active
- Since: unreleased
- Source: HAL-18847 section 2.2 and section 7, point 3 (Liam's review, 25 Nov), must-fail test 9

The Agent tools plugin shall keep the id of every comment the front bot posts with its task, serve the ids of a task's comments to a board user on `GET /chat-notes/{taskId}` (403 for anyone else), and treat a comment as the bot's when its id is on that list or it has no author and starts with `*Automatic note:* `; the front bot shall never answer such a comment, the chief line shall neither wake an agent nor send a signal for it, the board check shall not look at it for a board ask, and the PR watcher shall not count it as a task comment.

## Examples

- Given the bot posted comment `c-9` on a chat task, when its `issue.comment.created` event arrives, then the bot sends no request and the board check does not run for it.
- Given the bot's note after a PR's merge, when the PR watcher reads the task's comments, then the note is not among them.
