# messenger.needs-you

- Status: active
- Since: unreleased
- Source: the Messenger look and layout changes approved by the board on HAL-10 (26 Nov, 03:51 UTC) and HAL-19132 (point 8), Sofia's sketches on HAL-19134 (sketch B); built on HAL-19141

The Messenger shall show one entry, "Needs you", at the top of its list, with a violet count of the cards and questions waiting for the person across its chats, and no count when none waits. When the person opens it, the Messenger shall show in the chat's place a "Needs you" panel that says "3 waiting, oldest first" and lists each waiting card or question once, oldest first, with who asked, where ("in Engineering" for a channel, or the chat's name), **Open chat**, and the chat's own card, which the person can answer there as in the chat. Once answered, a card shall leave the panel and its count. **Open chat** shall open that chat.

## Examples

- Given Chief put "Merge #12?" to the person at 9:00 in his chat, and Elena asked "Which hostname?" at 8:30 in the channel Engineering,
  when the person opens "Needs you",
  then the entry's count is 2, the panel says "2 waiting, oldest first" and lists Elena's question "in Engineering" before Chief's card.
- Given the same panel,
  when the person answers Chief's card with "Yes",
  then the card leaves the panel and the count is 1.
- Given the same panel,
  when the person presses **Open chat** on Elena's question,
  then the channel Engineering opens.
