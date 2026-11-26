# remote.phone-shortcuts

- Status: draft
- Since: unreleased
- Source: HAL-19472 (sketch approved on HAL-18991, build plan on HAL-19143, placement and Back decided by Sofia on HAL-19149); the last chat: HAL-20160

When the Android app opens from its Inbox or Messenger shortcut, the phone app shall open the screen of the computer it would open anyway, on that tab, with the tab bar showing. When the person opens a chat in the Messenger tab, the phone app shall make it the last-chat shortcut, with its computer, its id and its name. The last-chat shortcut shall open that chat in the Messenger tab when it is on the computer the phone app opens, and the Messenger list when the chat is gone or on another computer. When a shortcut is tapped while the app runs, the phone app shall show that computer's screen on that tab, with any sheet, run detail or Paired computers closed, so Back from it leaves the app. While no computer is paired, Pair with a computer shall show "After pairing, Inbox opens." or "After pairing, Messenger opens." under its intro, and once paired the computer's screen shall open on that tab. Paired computers shall show a "Home screen" group with an "Add" for Inbox and for Messenger, each opening Android's own Add to Home screen for that screen, and shall show no group when the launcher doesn't pin shortcuts.

## Examples

- Given a paired computer and the Messenger shortcut tapped,
  when the app opens,
  then the computer's screen shows with the Messenger tab picked.
- Given the person opened the chat "Launch review" on Tim's laptop,
  when they tap the last-chat shortcut,
  then Tim's laptop's screen shows the Messenger tab with "Launch review" open.
- Given the last chat was deleted on the computer,
  when the person taps the last-chat shortcut,
  then the Messenger list shows.
- Given the person on Paired computers and the Inbox shortcut tapped,
  when the app shows again,
  then the computer's screen shows on the Inbox tab, and Back leaves the app.
- Given no paired computer and the Inbox shortcut tapped,
  when the app opens,
  then Pair with a computer says "After pairing, Inbox opens.", and after pairing the computer's screen opens on Inbox.
- Given a launcher that pins shortcuts,
  when the person presses Add next to Messenger on Paired computers,
  then Android's Add to Home screen opens for Messenger.
- Given a launcher that doesn't pin shortcuts,
  when Paired computers shows,
  then it has no "Home screen" group.
