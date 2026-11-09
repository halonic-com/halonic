# app.chat-progress

- Status: active
- Since: 0.1.0
- Source: HAL-1539; the chat status line in flow-assistant 2 ("Running · reading triage.workflow.yaml") and `agents.chat.header-status-from-state` in req-agents ("thinking…", "using <tool>…")

While the chat service makes an answer, it shall tell the answer's listener when each model turn starts, with its number from 1, when each tool call starts, and each message it adds, in the order they happen.

## Examples

- Given a listener and a model that calls `read_file` once and then answers,
  then the listener hears: turn 1, the assistant message with the call, the call to `read_file`, the tool result, turn 2, the final assistant message.
