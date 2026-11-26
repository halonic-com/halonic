# Decision: feedback starts with Ctrl+Shift+F in the focused window and selects inside it

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19271 (the board's report on 26 Nov: the shortcut should be simpler and not global, the overlay was wider than the window, black, and no box could be drawn; Tomas agreed to the requirement changes as feature owner)
- Kind: user-visible

The feedback shortcut is Ctrl+Shift+F (⌘⇧F on macOS) and is heard only by the focused Studio, Inbox or Messenger window; the shell registers no global key for feedback. The overlay is drawn inside that window, see-through with a 25% dim over the live app, instead of separate per-monitor windows with a still behind them. `plugin:feedback|start` takes a still of only the calling window and is granted to the main, Inbox and Messenger windows; `plugin:feedback|still` and the overlay windows are removed.

Security: before, only a physical key press could start a capture. Now any script in the main, Inbox or Messenger window can call `start`. The page never receives the pixels (`crop` is granted only to the Send feedback window, and the person has to press Send), but the still is a screen rectangle, so another app lying over the Studio window at that moment is in it.

## Covers

- studio.feedback-windows
- feedback.overlay
- feedback.settings-shortcut
