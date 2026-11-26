# agent-host.paperclip-decided-elsewhere

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10: a card answered in the Paperclip web app stayed open in Messenger and Inbox until a reload); plan approved by Liam

When a card that Studio lists as open is decided, cancelled or expires in Paperclip while the live events socket is open, the agent host shall list it with its final state (`answered` with who and when, or `closed` with its reason) within 2 seconds of the event, through the events' read of the local copy and without waiting for a poll. When the card ended while the agent host couldn't reach Paperclip, it shall list the final state with the read it makes when the events socket opens again.

## Examples

- Given an open card and an open events socket,
  when the board accepts the card in Paperclip and its task's event arrives,
  then within 2 seconds Studio lists the card as answered with Accept, by the board.
- Given the same card,
  when it is cancelled, or expires, in Paperclip and the event arrives,
  then within 2 seconds Studio lists it as `closed`, `cancelled` or `expired`.
- Given a dropped socket and Paperclip out of reach while the card is accepted,
  when Paperclip is back and the socket opens again,
  then Studio lists the card as answered at once.
