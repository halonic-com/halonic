# messenger.shared-layout

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout and the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 07:58 and 09:08 there; built on HAL-19492

The Messenger shall draw its list with the kit's plain rows (`kit.plain-list`) and the open chat's header with the kit's content header (`kit.content-header`), with the chat agent's picture or initial at 40px. While a chat's row shows an unread count, its name shall be semibold and its line full colour; otherwise its name shall be regular weight and its line muted.

## Examples

- Given Chief's chat with one message the board hasn't seen,
  when the board opens the Messenger,
  then Chief's row has a semibold name and a full-colour line.
- Given the same chat,
  when the board opens it,
  then the header shows Chief's initial on a 40px tile, and Chief's row has a regular name and a muted line.
