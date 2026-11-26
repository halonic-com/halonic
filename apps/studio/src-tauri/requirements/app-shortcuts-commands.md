# studio.src-tauri.app-shortcuts-commands

- Status: draft
- Since: unreleased
- Source: HAL-19143 (Android shortcuts to Inbox and Messenger, sketch approved on HAL-18991, plan approved on HAL-19148); Forget, Removed and format characters: HAL-20160

Where the shell runs on Android, a long press of the Halonic icon shall show Inbox, then Messenger, each with its approved app logo as the icon and the screen's name as its label. The shell shall let the app's own page take, once, the screen the last shortcut asked for through `phone_open_target`, make a chat the last-chat shortcut or remove it through `phone_last_chat`, ask whether the launcher pins shortcuts through `phone_can_pin`, and open Android's own Add to Home screen for Inbox or Messenger through `phone_pin`, from a local capability for the `main` window only.

A shortcut's intent shall name only a screen: `inbox`, `messenger` or `last-chat`. The last chat shall be the one the page stored last, and when none is stored the last-chat shortcut shall open Messenger. Any other intent shall open the app as its own icon does, and a shortcut shall never do more than open a screen. The last-chat shortcut's label shall be the chat's name, cut to 10 characters on the home screen and 25 in the long-press menu. The shell shall keep a chat only when its computer id is valid and its id and name are at most 200 bytes with no control characters and no format characters (Unicode `Cf`, such as the bidi controls). When the phone forgets a computer, or the computer removes the phone, the shell shall delete the last chat and its long-press entry if that chat is on that computer, and keep it otherwise; a copy of that last chat pinned to the home screen shall then read "Messenger" and open the Messenger list, until another chat becomes the last chat. While the window isn't on the app's own page, every command shall do nothing and answer no screen or `false`. No page shall reach the Kotlin plugin's own commands.

## Examples

- Given Halonic installed,
  when the person long-presses its icon,
  then the menu shows Inbox nearest the icon, then Messenger.
- Given the person opened the chat "Launch review for the acme website",
  when they long-press the icon,
  then a third entry shows "Launch review for the acm", and "Launch rev" once dragged to the home screen.
- Given another app starts Halonic with `halonic-shortcut://open/last-chat/acme-desk/other-chat`,
  when the page calls `phone_open_target`,
  then it gets no screen.
- Given the page asks to keep a chat named "Launch\u{202E}weiver",
  when the shell checks it,
  then the chat isn't kept and the answer is `false`.
- Given the last chat is on Tim's laptop,
  when the person forgets Tim's laptop, or Tim's laptop removes the phone,
  then the long-press menu no longer shows that chat, and its pinned copy on the home screen reads "Messenger".
- Given the phone forgot its computer,
  when the person taps a pinned last-chat shortcut,
  then the page gets Messenger.
- Given the window moved to `http://192.168.1.20:4280/`,
  when a page calls `phone_pin`,
  then nothing opens and the answer is `false`.
- Given the Studio served from `http://192.168.1.20:4280/`,
  when it calls `phone_open_target`,
  then the call is refused as not allowed.
