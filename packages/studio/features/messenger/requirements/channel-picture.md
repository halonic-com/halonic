# messenger.channel-picture

- Status: active
- Since: unreleased
- Source: Sofia's proposal on HAL-19491, part (b), approved by the board on 26 Nov; built on HAL-20150

Where the Messenger's list row or the open conversation's header shows a channel, the Messenger shall draw the channel's picture as two members' tiles: its lead in front, at the bottom right, and one more member behind it, at the top left, the first other member its source lists, with a gap cut out of the tile behind around the one in front. Each tile shall show that member's picture, read once while the Messenger is open (`messenger.agent-pictures`), or while it is missing or can't be read the member's initial on their own tint (`kit.avatar-tint`). Once the lead has left, the first member listed shall be in front. A channel with one listed member shall show that member alone, and a channel with none its title's letters on the neutral tile. The picture is decoration, hidden from screen readers: the row's title names the channel.

## Examples

- Given the channel Engineering, led by Chief, with Elena and Liam as members, and no pictures,
  when the board opens the Messenger,
  then Engineering's row shows Chief's "C" on Chief's tint in front of Elena's "E" on Elena's tint.
- Given that channel,
  when the board opens it,
  then its header shows the same pair, at 28px each in the 40px picture.
- Given Elena has a picture,
  when the board opens the Messenger,
  then the tile behind Chief's draws Elena's picture, read once.
