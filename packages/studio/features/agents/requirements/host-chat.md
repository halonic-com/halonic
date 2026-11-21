# agents.host-chat

- Status: active
- Since: unreleased
- Source: HAL-13177 (T6 Try it chat); flow-agents 4.4; HAL-11705

When the agent's Try it chat sends a message, the agents feature shall ask `AgentsHostService` to `answer` it with the conversation so far, the person's Stop signal and a listener for each turn, tool call and message, and get back the messages the answer added and how it ended. When the agent isn't there, `answer` shall reject with `not_found`.

## Examples

- Given the in-memory host's agent `sorter`,
  when the chat asks it to answer "Sort this mail",
  then the listener hears the reply, and the answer ends as `answered` with that reply.
- Given the host has no agent `ghost`,
  when the chat asks it to answer,
  then it rejects with `not_found`.
