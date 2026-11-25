# paperclip-client.automatic-notes

- Status: active
- Since: unreleased
- Source: plan "Messenger live replies" (HAL-18743, sections 2 and 5.1), approved by the board on 25 Nov at 18:46; task HAL-18755

When an agent's comment on a chat task carries a `fastResponseRequestId`, the Paperclip provider shall give it as a message from that agent marked `automatic`, because Paperclip's fast response wrote it in the agent's name and it is not the agent's answer. The provider shall leave every other comment unmarked, and shall never mark the person's own comment.

## Examples

- Given Ada's comment "On it. Checking the build first." with a `fastResponseRequestId`,
  when the provider lists the chat's messages,
  then that message is from Ada and marked `automatic`.
- Given Ada's comment without a `fastResponseRequestId`,
  when the provider lists the chat's messages,
  then it is not marked.
