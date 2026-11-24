# messenger.quick-actions

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md` (feature 9, and the HAL-17421 renders, 4e); Julian's security review HAL-17436 (finding 3); HAL-17443.

In a conversation, the Messenger shall show each open inbox item that the conversation's agent put to the person, with its options as buttons and the line "Also in your Inbox. Answering here answers it there." When the person picks an option, it shall answer that item through exactly one `AgentMessaging.answer` call. When the person picks "Ask for an update", it shall send one plain message through exactly one `AgentMessaging.send` call. A quick action shall never run a command on the person's computer. While the conversation's source is offline or signed out, a quick action shall send nothing and say why.

## Examples

- Given Chief's open card "Merge #12?" with the options Approve and Reject,
  when the board opens the chat with Chief and picks Approve,
  then `AgentMessaging.answer` is called once, with the card and the option Approve, and the card leaves the chat.
- Given the chat with Chief,
  when the board picks "Ask for an update",
  then `AgentMessaging.send` is called once, with the chat and "Can you give me an update?", and the message shows in the chat.
- Given a card another agent put to the board,
  when the board opens the chat with Chief,
  then that card doesn't show in Chief's chat.
- Given Chief's source is offline,
  when the board picks "Ask for an update",
  then nothing is sent and the chat says the source is offline.
