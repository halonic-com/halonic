# assistant.chat.failed

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7); states H22, H23 and H24 (HAL-5896); flow-assistant 5.9 (HAL-647); microcopy 14.1 (HAL-751)

When a Build chat's answer fails, the chat shall end the reply in `danger` with "Couldn't reach the model: *reason*.". When no tool call ran in that answer, it shall offer **Try again**, which continues the answer without a new message, so the chat's last message is sent again. When a tool call already ran, the line shall add "Some tool calls already ran. Send a new message to continue." and offer no Try again, because a tool may have sent something.

## Examples

- Given the model call fails with "Ollama didn't answer." before any tool ran,
  then the reply ends with "Couldn't reach the model: Ollama didn't answer." and Try again answers the chat again.
- Given a tool ran and the next model call fails with "Overloaded.",
  then the reply ends with "Couldn't reach the model: Overloaded. Some tool calls already ran. Send a new message to continue." and there is no Try again.
