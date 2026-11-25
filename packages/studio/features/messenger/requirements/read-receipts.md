# messenger.read-receipts

- Status: active
- Since: unreleased
- Source: the board's request on HAL-18736 (HAL-10, 25 Nov, 19:00 UTC); plan approved on HAL-18736 (25 Nov, 19:02 UTC).

In a chat with one agent, the Messenger shall show one tick after the time under each message the person sent, once the source has it, and two ticks once the source says the chat's agent picked it up (`readAt`). A screen reader shall hear "Sent", or "Read" and the time it was picked up, such as "Read 19:02", and the pointer shall see the same words as a tooltip. A message still on its way shall keep "Sending…" and show no tick. In a channel, the work lines under the person's message say what each agent did with it instead (`messenger.channel-messages`).

## Examples

- Given the board sent "On it" to Chief at 09:30,
  when the message was sent,
  then "09:30" and one tick show under it, and a screen reader hears "Sent".
- Given the same message,
  when Chief's run picks it up at 09:32,
  then two ticks show, and a screen reader hears "Read 09:32".
- Given the board sends a message,
  while it is on its way,
  then "Sending…" shows under it, with no tick.
