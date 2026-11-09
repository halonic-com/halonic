# app.chat-turn-loop

- Status: active
- Since: 0.1.0
- Source: HAL-1539, step 7(a) of the HAL-186 implementation plan; the turn loop of the old Build chat and agent chat (req-assistant, req-agents)

When the chat service answers a message, it shall ask the model through `RunExecutor.chatTurn` with the conversation, the answer's messages so far and the definitions of the chat's tools, run each tool the model calls in the order the model gave them, add each result as a tool message with the call's id and name, and ask again, until the model answers without a tool call. It shall return the messages it added, each assistant message with the model's tool calls and its unchanged `replay`, and shall not change the conversation it was given. If the model calls a tool the chat doesn't offer, or a tool fails, then the chat service shall give the model the result "Error: <message>" and carry on.

## Examples

- Given a chat with tool `read_file` and the message "What does triage do?",
  when the model calls `read_file` with path `triage.workflow.yaml` and then answers "It sorts mail.",
  then the answer adds an assistant message with the call, the tool result with the call's id, and "It sorts mail.", and the second model turn saw the tool result.
- Given a model turn with two tool calls,
  then both run, in the model's order, before the next model turn.
- Given `read_file` throws "no such file: notes.md",
  then the model reads "Error: no such file: notes.md" and the answer goes on.
- Given the model calls `send_mail`, which the chat doesn't offer,
  then the model reads `Error: there is no tool named "send_mail".`
