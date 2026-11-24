# assistant.chat.engine-stopped

- Status: active
- Since: unreleased
- Source: HAL-16796 (T14 PR 6b); states H13, D4 and K3 (HAL-5896, HAL-1307); flow-assistant 5.9 (HAL-647); microcopy 14.1 (HAL-751)

When a Build chat's answer ends because Halonic's engine stopped answering (the answer ends as failed, or is rejected, with `EngineNotAnswering`), the chat shall end the reply with "Stopped when Halonic's engine stopped." and offer **Try again**, which sends the last message again by continuing the answer without a new message. When a tool call already ran in that answer, the line shall add "Some tool calls already ran. Send a new message to continue." and offer no Try again.

## Examples

- Given the Build chat is answering and no tool ran, when the engine stops answering,
  then the reply ends with "Stopped when Halonic's engine stopped." and Try again sends the chat's last message again.
- Given the Build chat is answering and `read_file` already ran, when the engine stops answering,
  then the reply ends with "Stopped when Halonic's engine stopped. Some tool calls already ran. Send a new message to continue." and there is no Try again.
