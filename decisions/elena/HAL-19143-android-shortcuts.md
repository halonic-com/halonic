# Decision: the phone's own page may use the Android app's shortcuts

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19148 (plan approved by Liam; sketch approved by the board on HAL-18991); Liam reviews and Julian signs off this PR as a security PR
- Kind: internal

The phone's own page gets four new commands, on Android only, from a local capability for the
`main` window (`capabilities/app-shortcuts.json`). `phone_open_target` answers, once, the screen
the last shortcut asked for. `phone_last_chat` makes a chat the last-chat shortcut, or removes it.
`phone_can_pin` answers whether the launcher pins shortcuts. `phone_pin` opens Android's own Add to
Home screen for Inbox or Messenger, and no other screen. They back the long-press menu of the
Halonic icon (Inbox, Messenger, the last chat) and pinning (HAL-19143).

The launcher activity is exported, so any app can start it with any intent. The Kotlin
`AppShortcutsPlugin` reads only a screen's name from the intent (`inbox`, `messenger`,
`last-chat`). The last chat is the one the page stored, and the shell checks it again before the
page sees it. Anything else opens the app as its icon does, and a shortcut only opens a screen,
never acts. A chat is kept only with a valid computer id, and an id and name of at most 200 bytes
with no control characters. Every command does nothing while the window isn't on the app's own
page, the same page check as `tunnel_send`. No capability grants the plugin's own commands.

`studio.src-tauri.served-page` lists every command the connect page may call, so its Android list
gains these four. The served page is still refused every command.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/capabilities/app-shortcuts.json
