# messenger.send-text

- Status: active
- Since: unreleased
- Source: HAL-18807 (Liam's review of #6183 on HAL-18625, the quick-ask box)

When a box outside the Messenger, such as quick ask, sends a text to a conversation, the Messenger
shall send exactly that text to the conversation's lead through one `AgentMessaging.send` call, with
no files and no picked agents, and shall leave the conversation's draft, its waiting files and its
picked agents as they were. When the text holds nothing but spaces, or the conversation's source is
offline or signed out, the Messenger shall send nothing and say why.

## Examples

- Given the chat with Chief holds the draft "Half a thought" and the file `login.png`,
  when quick ask sends "Where are we with the release?",
  then only "Where are we with the release?" is sent, and the draft and `login.png` still wait.
- Given Paperclip · Acme is offline,
  when quick ask sends a text to its chat,
  then nothing is sent and the reason is "offline".
