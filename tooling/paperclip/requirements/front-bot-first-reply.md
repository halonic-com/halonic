# paperclip.front-bot-first-reply

- Status: active
- Since: unreleased
- Source: HAL-19136 (board, 26 Nov: step 1 of the front bot design on HAL-18847, "Can ship asap"); design sections 2.2, 4.2 and 4.5

When a board user's comment is created on a chat task (a task with a conversation agent) of the company, and the front bot is on with its Anthropic key set, the Agent tools plugin shall send one request to `https://api.anthropic.com/v1/messages` for `claude-haiku-4-5-20251001` with the fixed prompt, the task's title, the message and at most the 5 comments before it, each quoted as data, and shall post the reply that passes `paperclip.front-bot-grounding` as a comment with no author, starting with `*Automatic note:* `; it shall make no request for a comment by an agent, a comment with no author, a comment on a task that isn't a chat task, a comment of another company, a message or title shaped like a key, or a message the chat's agent already answered; it shall leave out of the request the bot's own comments and any comment shaped like a key; it shall post nothing for a `SKIP` answer, a rejected reply, a failed request, or a reply written after the chat's agent answered; and the key shall go only into the request's `x-api-key` header, never into the request body, a log line, a metric or a comment.

## Examples

- Given the bot on and a board user's "Is #6129 merged yet?" on a chat task whose earlier comment is Liam's approval at 13:52,
  when Haiku answers "About PR #6129. Depends on the merge queue; the last word on its task is Liam's approval at 13:52.",
  then the plugin posts "*Automatic note:* About PR #6129. Depends on the merge queue; the last word on its task is Liam's approval at 13:52." with no author.
- Given the bot on, when an agent comments on a chat task, then the plugin sends no request.
- Given the bot on, when Haiku answers with HTTP 500, then the plugin posts nothing and logs only `http_500`.
