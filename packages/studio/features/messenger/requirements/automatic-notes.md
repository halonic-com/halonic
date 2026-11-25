# messenger.automatic-notes

- Status: active
- Since: unreleased
- Source: plan "Messenger live replies" (HAL-18743, sections 2, 3.2 and 4), approved by the board on 25 Nov at 18:46; task HAL-18755

The Messenger shall show a message its source marks `automatic`, such as Paperclip's fast-response receipt, as the agent's bubble with a dashed edge and a small automatic mark, whose tooltip says "Written automatically from what Chief is doing. Chief's own answer follows." and which a screen reader reads before the note. An automatic note shall not be the conversation's reply: it shall not change the row's preview, set its unread dot, put the chat under "Waiting for me" or change the agent's working line.

## Examples

- Given Chief is working on the board's "Is 0.3 ready?",
  when the automatic note "On it. Checking the build." arrives,
  then the chat shows it in a dashed bubble with the automatic mark, the row still says "You: Is 0.3 ready?" with no unread dot, and Chief's header still says "Working".
- Given the same chat,
  when Chief answers "Yes, 0.3 is built.",
  then the row shows that answer with the unread dot, under "Waiting for me".
