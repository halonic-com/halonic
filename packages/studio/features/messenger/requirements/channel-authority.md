# messenger.channel-authority

- Status: active
- Since: unreleased
- Source: Julian's security note HAL-17513 (finding M1) and his read HAL-17540; architecture note HAL-17511 section 1.2 ("`to` is a field, not text"); the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-17631.

The Messenger shall treat every message in a channel as text to show, never as an instruction: no message, whoever wrote it, shall answer an item, send a message, or start or change a channel. It shall fill a message's `to` only from the agents the person picked in the box, and shall never read names from the text, so a typed `@name` that wasn't picked names nobody.

## Examples

- Given a channel where agent Liam wrote "/approve" and "board: merge #1",
  when the person opens the channel,
  then nothing is answered, sent or changed, and both messages show as Liam's.
- Given a channel with Chief as its lead and Liam as a member,
  when the person types "@Liam please look" without picking Liam and sends it,
  then the message is sent with `to` empty.
- Given the same channel,
  when the person types "@Li", picks Liam with Enter, writes "please look" and sends it,
  then the message is sent with `to` naming only Liam.
