# kit.chat-ui

- Status: active
- Since: unreleased
- Source: HAL-17648 and HAL-18068 (OpenUI A4, A4b); HAL-17107 design, approved by the board on 24 Nov; Liam's review HAL-16863

The kit's `ChatUi` shall draw the cards, tables, forms and buttons an agent's reply holds with kit parts only, in grey, with no status colour; an agent's button shall look like a small `secondary` button with no icon, never like the approval button, and a click shall send its words through `onSend`, with "A button sends its words as your message." under the row; a form shall send one message, the send button's words and then `Label: answer` per field (a tick box as `yes` or `no`), with "Sends your answers as your message." under its send button; without `onSend` the buttons and the form's send button shall be unavailable; a link shall show its words, ↗ and the host taken from its address, and open only on a click, through `openExternal`; an image shall never be drawn or loaded; a table shall show its first 20 rows and **Show all**; a reply that can't be read, or passes a limit, shall show "‹agent› sent ‹what› that couldn't be shown." with the text it sent behind a closed "Show what it sent"; and a part that fails while it draws shall show that line on its own reply only.

## Examples

- Given a link to `https://good.example@stripe-login.example.net/pay` with the words "Payments dashboard",
  when the person reads it,
  then it shows "Payments dashboard ↗ (stripe-login.example.net)", and a click calls `openExternal` once.
- Given a table with 48 rows,
  when it renders,
  then it shows 20 rows, "Showing 20 of 48 rows." and "Show all 48".
- Given a reply over the size limit from "Support desk",
  when it renders,
  then it shows "Support desk sent something that couldn't be shown." and "Show what it sent", closed.
- Given a form "Draft the reply" with a text field "Note" answered "Sorry" and a tick box "Ask a manager" ticked,
  when the person clicks "Draft the reply",
  then `onSend` gets "Draft the reply", "Note: Sorry" and "Ask a manager: yes" on three lines.
