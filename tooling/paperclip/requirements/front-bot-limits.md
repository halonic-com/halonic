# paperclip.front-bot-limits

- Status: active
- Since: unreleased
- Source: HAL-18847 section 4.3 (kill switch, cap, logging) and the board's answer to question 2 (26 Nov: Haiku 4.5, $3 daily cap)

While the front bot's setting is off (the default), its key is unset, the day's spend (UTC), counted from each answer's tokens at Haiku 4.5's $1 and $5 per million, is $3 or more, or more than 1 in 5 of at least 5 calls in the last 15 minutes failed (then for 15 minutes), the Agent tools plugin shall send no request to Anthropic for the front bot and post nothing; when a call takes the day's spend to 80% of the cap, it shall comment once that day on the Chief's task set in the settings; and for every message it decides on, it shall log one record with only the fields `at`, `companyId`, `taskId`, `runId`, `callType`, `inputTokens`, `outputTokens`, `costMicroUsd`, `latencyMs`, `outcome` and `reason`, where `reason` is a fixed code, never message text, a prompt, a reply, an error body or a header.

## Examples

- Given the bot off, when a board user writes on a chat task, then the plugin sends no request and logs nothing.
- Given today's spend at $3.00, when a board user writes on a chat task, then the plugin sends no request and logs the outcome `capped`.
- Given 4 of the last 5 calls failed, when a board user writes on a chat task within 15 minutes, then the plugin sends no request and logs the outcome `stopped`.
