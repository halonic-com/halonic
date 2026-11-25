# agents.chat.chat-ui

- Status: draft
- Since: unreleased
- Source: HAL-17649 (OpenUI A5); OpenUI plan approved by the board on 23 Nov and the look on 24 Nov (HAL-17107); Liam's review HAL-16863

When the agent's `chatUi` is off, a Try it reply shall show its text as written, OpenUI Lang included. When it is on, a reply's text from the line that starts `root =`, or the fence that line sits in, shall be drawn with the kit's `ChatUi`, with the words before and after it as text; while the reply is written, what is still open shall be drawn as far as it got. Drawing a reply shall send nothing. Only the newest reply's buttons and form shall work, once it has ended: a button shall send its own words, and a form its answers as one message, as the person's next message, shown in their bubble, through the same checks as Send, so the key check holds a message that looks like it has a key in the box, and in a workspace that isn't trusted nothing is sent and the words wait in an empty box. An older reply's controls shall show what was sent after it (`kit.chat-ui-answered`).

## Examples

- Given `chatUi` off and a reply `root = Stack([Buttons([Button("Not now")])])`,
  when it ends,
  then the reply shows that text and no button.
- Given `chatUi` on and a reply with the buttons "Draft replies for all 4" and "Only those under €100",
  when the person clicks "Only those under €100",
  then the next message is "Only those under €100", shown in the person's bubble, and the button keeps a tick with "You sent “Only those under €100”.".
- Given a reply with a form "Draft the reply" whose field "Note" is answered "Sorry",
  when the person sends it,
  then one message "Draft the reply" and "Note: Sorry" on two lines is sent and shown.
- Given a reply with buttons, answered by typing "Something else",
  when the next reply ends,
  then the older reply's buttons are unavailable with "These were for an earlier reply. Type your answer instead.".
