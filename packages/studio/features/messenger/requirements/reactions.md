# messenger.reactions

- Status: active
- Since: unreleased
- Source: the board's request on HAL-10 (26 Nov, 03:51 UTC); the board approved the proposal on HAL-19139 (26 Nov, 12:21 UTC), and Sofia's sketch on HAL-19139 sets how it looks.

The Messenger shall show the reactions under every message in a chat, old ones from history included. One chip per emoji, in the set's order (👍 ❤️ 😂 😮 ✅ 👀), shows its count, the person's own in the accent colour. Its tooltip names who reacted ("Thumbs up: You and Chief"), and a screen reader hears the same with the count ("Thumbs up, 2: you and Chief"). While the source keeps reactions and is online, the Messenger shall show an "Add a reaction" button beside each message on hover or focus, which opens a row of the six as a menu of checkbox items. Pressing an emoji or a chip shall add the person's own reaction, or take it off when it's there, and show the change at once. If saving it fails, the chip shall go back and a toast shall say "Couldn't save the reaction. Try again." While the source is offline, the chips shall show but not be pressable, and no add button shall show. Where the source keeps no reactions, the chat shall show without them, and a failed read of the reactions shall never fail the chat. A reaction is never a message, so it changes no unread count.

## Examples

- Given Chief wrote "Morning" yesterday and Chief and the board reacted to it with 👍,
  when the board opens Chief's chat,
  then "👍 2" shows under "Morning", pressed, and a screen reader hears "Thumbs up, 2: you and Chief".
- Given the same chat,
  when the board opens "Add a reaction" beside "Morning" and picks "Eyes",
  then "👀 1" shows under it at once, and focus goes back to the button.
- Given saving the board's reaction fails,
  when the board picks "Heart",
  then the chip goes, and a toast says "Couldn't save the reaction. Try again."
- Given Chief's source is offline,
  when the board opens Chief's chat,
  then the chips show but can't be pressed, and no "Add a reaction" button shows.
- Given a source that keeps no reactions,
  when the board opens its chat,
  then the messages show, with no chips and no button.
