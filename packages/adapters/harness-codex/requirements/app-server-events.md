# harness-codex.app-server-events

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D2; HAL-3587 (Codex 0.166.0 protocol from `codex app-server generate-json-schema`, recorded sessions in `src/fixtures/`)

The Codex harness shall turn the notifications of `codex app-server` about the agent's thread into run events. A shell command, a file change, a call to an MCP tool and an image Codex looks at shall become `tool.called` when the item starts and `tool.result` when it completes, with an `error` outcome when the item failed or was declined; an item Codex reports only as completed shall become both. A call to the bridge's MCP server, `halonic`, shall give no event, because the bridge records it. `turn/completed` with the status `completed` shall become the one final `agent.finished`, whose output is the last thing the agent said, and nothing shall follow it. A turn that failed or was interrupted shall end the run with an error instead; when the model provider refused the key or sign-in (HTTP 401), the error shall not repeat the provider's answer, which can hold part of a key. Notifications about other threads, and notifications and item types it doesn't know, shall be skipped. No event and no error shall contain the bridge token.

## Examples

- Given Codex runs `ls notes` and it completes,
  when its notifications are read,
  then the events are `tool.called` for `shell` with the command and folder, and `tool.result` with the output and outcome `ok`.
- Given a call to `send_email` on the MCP server `halonic`,
  when its notifications are read,
  then there is no event for it.
- Given the agent says "I wrote notes/summary.md." and the turn completes,
  when `turn/completed` is read,
  then the event is `agent.finished` for "writer" with that output, and later notifications give no event.
- Given a command whose output holds the bridge token,
  when its notifications are read,
  then `tool.result` has `[secret removed]` in its place.
- Given a turn that failed with HTTP 401,
  when `turn/completed` is read,
  then the run ends with an error that says the provider refused the key or sign-in, without the provider's message.
