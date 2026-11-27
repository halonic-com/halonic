# paperclip.front-bot-first-reply

- Status: active
- Since: unreleased
- Source: HAL-19136 (board, 26 Nov: step 1 of the front bot design on HAL-18847, "Can ship asap"); design sections 2.2, 4.2 and 4.5; HAL-19588 (board on HAL-10, 26 Nov: short texting-style replies over several messages)

When a board user's comment is created on a chat task (a task with a conversation agent) of the company, and the front bot is on with its Anthropic key set, the Agent tools plugin shall send one request to `https://api.anthropic.com/v1/messages` for `claude-haiku-4-5-20251001` with the fixed prompt, the task's title, the message and at most the 10 comments before it, each quoted as data, and, when the reply passes `paperclip.front-bot-grounding`, shall post each of its lines as its own comment with no author, starting with `*Assistant:* `, waiting 0.7 seconds plus 35 ms per character (at most 2.5 seconds) before each line after the first; it shall make no request for a comment by an agent, a comment with no author, a comment on a task that isn't a chat task, a comment of another company, a message or title shaped like a key, or a message the chat's agent already answered; it shall leave out of the request the bot's own comments and any comment shaped like a key; it shall post nothing for a `SKIP` answer, a rejected reply, a failed request, or a reply written after the chat's agent answered, and shall post no further line once the chat's agent has answered; it shall give up on a request not answered within 8 seconds, logging it as failed with `timeout`, and shall never follow a redirect; and the key shall go only into the request's `x-api-key` header, never into the request body, a log line, a metric or a comment.

## Examples

- Given the bot on and a board user's "Is #6129 merged yet?" on a chat task whose earlier comment is Liam's approval at 13:52,
  when Haiku answers "Good question" and "Checking the queue for #6129" on two lines,
  then the plugin posts "*Assistant:* Good question" and, after a short pause, "*Assistant:* Checking the queue for #6129", each with no author.
- Given the bot on, when an agent comments on a chat task, then the plugin sends no request.
- Given the bot on, when Haiku answers with HTTP 500, then the plugin posts nothing and logs only `http_500`.
