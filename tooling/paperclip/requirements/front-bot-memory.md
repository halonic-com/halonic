# paperclip.front-bot-memory

- Status: active
- Since: unreleased
- Source: HAL-19597 (the board's addition on HAL-10: "memory as well, as long as its quick")

When the board turned the front bot's memory on, the Agent tools plugin shall quote a chat's running summary and the writing board user's lasting notes to the first reply as data, read from plugin state with no search and no extra call; shall rewrite both with one call only after that reply's lines are posted, never while the reply is made; shall drop every part shaped like a key before any write; shall serve the summary and the asking board user's notes on `GET /chat-memory/{taskId}` and clear both on `DELETE /chat-memory/{taskId}`, to a board user only (403 for anyone else); and the grounding check shall not count the memory as input, so a reply that names a number, name or result found only in memory is rejected.

## Examples

- Given the summary says "#6130 was merged at 13:40", when the reply says "Checking #6130", then the reply is rejected as `unknown_number` and nothing is posted.
- Given the memory call answers a note holding a key, when the memory is saved, then that note is not stored.
- Given an agent asks `GET /chat-memory/{taskId}`, then the answer is 403.
