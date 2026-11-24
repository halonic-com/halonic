# assistant.sessions.shorten-long-tool-results

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U60 (Now); flow-assistant 5.4 (HAL-647); req-assistant (HAL-110); HAL-16791

When chats are saved, the assistant shall cut every tool result longer than 4,000 characters in the model's history to its first 4,000 characters followed by "\n… (cut)". The person's messages, the replies and the tool calls, with a proposal's whole content, shall be saved whole.

## Examples

- Given a chat where `read_file` returned 10,000 characters,
  when the chat is saved,
  then that tool result is the first 4,000 characters plus "\n… (cut)".
- Given a tool result of 300 characters, then it is saved whole.
- Given a `propose_file` call whose content is 10,000 characters, then the call is saved whole.
