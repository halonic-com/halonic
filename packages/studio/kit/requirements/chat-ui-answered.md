# kit.chat-ui-answered

- Status: active
- Since: unreleased
- Source: HAL-17649 (OpenUI A5); HAL-17107 design, approved by the board on 24 Nov

When `ChatUi` gets `answered`, the message the person sent after its reply, its buttons and its form's send button shall be unavailable and its form's fields shall not change. The button whose words equal that message shall keep a tick, with "You sent “‹words›”." under the row; a form whose send button's words start that message shall keep a tick on its send button and show the answers it sent, with "You sent your answers." under it; buttons and a form the message didn't come from shall say "These were for an earlier reply. Type your answer instead."

## Examples

- Given buttons "Draft replies for all 4", "Only those under €100" and "Not now", answered with "Only those under €100",
  when the reply renders,
  then every button is unavailable, "Only those under €100" has a tick, and the line reads "You sent “Only those under €100”.".
- Given a form "Draft the reply" with a text field "Note", answered with "Draft the reply" and "Note: Sorry" on two lines,
  when the reply renders,
  then "Note" shows "Sorry" and can't be changed, "Draft the reply" has a tick and is unavailable, and the line reads "You sent your answers.".
- Given buttons "Yes" and "No", answered with "Maybe later",
  when the reply renders,
  then no button has a tick, and the line reads "These were for an earlier reply. Type your answer instead.".
