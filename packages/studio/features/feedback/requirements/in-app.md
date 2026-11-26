# feedback.in-app

- Status: active
- Since: unreleased
- Source: board request (26 Nov): the shortcut only in the focused window, the overlay inside it; the shell's commands in `studio.src-tauri.feedback-capture`

While one of Studio's own windows on the desktop (Studio, Halonic Inbox, Halonic Messenger) is
focused, the Feedback feature shall hear the feedback shortcut in that window and only there, before
the rest of the window, including while the person types in a text field; nothing shall be
registered system-wide. The shortcut is the host setting `feedback.shortcut`, Ctrl+Shift+F (⌘⇧F on macOS) until
another is saved, matched by its physical key and exactly its modifiers; a saved shortcut that holds
none of Ctrl, Alt and ⌘ shall count as Ctrl+Shift+F. When the person presses it
and no overlay shows, the feature shall call `plugin:feedback|start` and, when the shell answers the
still's width and height, show the selection overlay (`feedback.overlay`) in that window. When the
shell refuses with `send_open`, `unavailable` or `busy`, the feature shall show nothing. When the
person presses it while the overlay shows, the feature shall take the overlay away and call
`plugin:feedback|end`. When the overlay has shown for two minutes, the time the shell holds the
still, the feature shall take it away. The feature shall ignore a held key's repeats.

## Examples

- Given Studio's window on Windows,
  when the person presses Ctrl+Shift+F,
  then the shell is asked to start and the overlay shows in that window.
- Given Studio's window,
  when the person presses Shift+F, or Ctrl+F,
  then nothing is asked of the shell.
- Given the overlay showing,
  when the person presses Ctrl+Shift+F again,
  then the overlay goes away and the shell is asked to end.
- Given a saved shortcut `Shift+F`,
  when the person presses Shift+F, then Ctrl+Shift+F,
  then only Ctrl+Shift+F asks the shell to start.
- Given the overlay showing for two minutes,
  when no box was drawn,
  then the overlay goes away.
- Given the Send feedback window open,
  when the person presses Ctrl+Shift+F and the shell answers `send_open`,
  then no overlay shows.
