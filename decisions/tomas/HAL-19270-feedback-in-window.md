# Decision: the feedback shortcut moves inside Studio's own windows

- Approval: the board's feedback of 26 Nov on the feedback shortcut (HAL-18563), carried by the board's pull request halonic#6387 and taken over on Paperclip task HAL-19270
- Kind: user-visible

The board decided on 26 Nov that the feedback shortcut is Ctrl+Shift+F (⌘⇧F on macOS), heard only
by the focused Studio, Halonic Inbox or Halonic Messenger window, with no system-wide key. The
selection overlay shows inside that window, see-through over the live app, instead of one black
overlay window per screen. The shell's `plugin:feedback|still` and the per-screen overlay windows
give way to `plugin:feedback|start`, which takes one still of the calling window, and the
`desktop-feedback-capture` capability.

The review of #6387 added three limits, recorded in the same requirements: `start` is refused as
`not_focused` unless the calling window is focused, `select` is refused as `other_window` from any
window but the one whose press took the still, and the overlay closes itself when the still's two
minutes are over. A saved shortcut that holds none of Ctrl, Alt and ⌘ now falls back to the default
in the page, since the shell no longer reads the saved shortcut.

The requirements below change with it, and the tests of the per-screen overlays, the global key
and the shell's saved-shortcut reading go with the code they tested.

## Covers

- studio.feedback-windows
- feedback.overlay
- feedback.settings-shortcut
- studio.src-tauri.feedback-capture
- studio.src-tauri.feedback-presses
- packages/studio/features/feedback/src/feedback-windows.test.tsx
- apps/studio/src/studio/start-studio.feedback.test.ts
- apps/studio/src-tauri/src/feedback_capture_tests.rs
- apps/studio/src-tauri/src/feedback_press_tests.rs
