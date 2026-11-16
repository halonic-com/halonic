# inbox.request-card

- Status: active
- Since: 0.1.0
- Source: HAL-1305; flow-inbox 3.3; first-run 4.2 (revision 12); accessibility pass 3.3 and 8.2

When the card for a request that was just sent arrives in Needs you, it shall open by itself and take focus only if focus is still on **Send** or in the request form. Otherwise only its row shall appear, and the announcer shall say "New in Needs you: *title*". No other card opens by itself.

## Examples

- Given a request you sent and focus still on **Send**,
  when the run it started waits for you,
  then its card is open.
- Given a request you sent and focus moved to the list,
  when the run it started waits for you,
  then no card opens, the row is in the list and the announcer says "New in Needs you: Approve this reply?".
- Given a waiting run you didn't send as a request,
  when it arrives,
  then no card opens.
