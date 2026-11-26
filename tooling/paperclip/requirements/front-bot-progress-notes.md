# paperclip.front-bot-progress-notes

- Status: active
- Since: unreleased
- Source: HAL-18847 section 1 (v1 step 2) and section 4, HAL-18743 section 5 (notes design, Julian's log rules), Liam's conditions in HAL-18847 section 7; HAL-19218

While the front bot's setting and its own progress-notes setting (`frontBotNotesEnabled`, off by default) are both on and its Anthropic key and Paperclip's API url and key are set, when a board user writes on a chat task, the Agent tools plugin shall follow the chat's active run with at most one watcher per chat: every 15 s it shall read the run's status and the new part of its log, and it shall stop when the run is no longer queued or running, when the chat's agent has written after the message, after 5 notes, when the day's cap or the error stop holds, or when no run starts within 2 minutes. From the log it shall read only the kind, the status and, for a command, a program and plain subcommand on a fixed list of `acpx.tool_call` records, never a tool's output text, thinking or the agent's own text. It shall ask Haiku 4.5 for a note at the earliest 30 s after the watch started, then at most every 45 s, and only when a step started or changed since the last call. A note is kept only when it passes the progress check, and is then kept in plugin state and served to a board user on `GET /chat-notes/{taskId}` as `progressNotes`, never as a comment. Notes count towards the front bot's $3 daily cap and error stop, and every decision leaves one log record with only the allowed fields and `callType` `progress_note`.

## Examples

- Given the progress-notes setting off, when a board user writes on a chat task whose agent runs, then the plugin reads no run and sends no request.
- Given a run that thinks "the key is sk-…" and ran `curl -H "x-api-key: …"`, when a note is asked for, then the request holds "Ran curl (running)" and neither the thought nor the key.
- Given a note was kept, when the board reads `GET /chat-notes/{taskId}`, then `progressNotes.notes` holds it and the task has no new comment.
