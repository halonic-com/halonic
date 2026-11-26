# Decision: Send feedback is a dialog in the window where the shortcut was pressed

- Approval: the board's report on HAL-10 (26 Nov) that Send feedback opened a window it couldn't close, showing Studio's Open folder screen, and asking for the modal of the approved sketch (HAL-18562); plan approved by Liam on Paperclip task HAL-19528
- Kind: user-visible

After an area is selected, the Send feedback form now shows as a dialog inside the Studio, Halonic
Inbox or Halonic Messenger window where the shortcut was pressed, as the sketch on HAL-18562 shows
it. Cancel, the ✕ and Esc close it and end the feedback; Send closes it once the feedback is handed
on. No window opens for it.

Before, `plugin:feedback|select` opened a borderless, always-on-top window labelled `feedback`. The
page side never learned that label, so the window started as plain Studio, showed the Open folder
screen, and had nothing that could call `plugin:feedback|end`: the person couldn't close it.

The shell changes with it: `select` keeps the crop and opens no window; `plugin:feedback|crop` moves
from the `desktop-feedback-window` capability, which goes away, to `desktop-feedback-capture`
(Studio's own windows) and answers only the window whose press took the still, refusing any other
as `other_window`. A press no longer finds a Send feedback window to bring forward, so the
`send_open` refusal goes; the page leaves an open dialog and its text alone on another press. A
crop kept when its window closes without Cancel or Send stays until the next press or the end,
which drop it.

The requirements below change with it. The tests of the Send feedback window, of bringing it
forward (`send_open`) and of its closing go with the code they tested; new tests cover the dialog
opening after a selection, closing on Cancel, the ✕ and Esc, sending, another press leaving it
alone, no window opening on `select`, and `crop` refused to another window.

## Covers

- feedback.send-window
- feedback.in-app
- studio.feedback-windows
- studio.src-tauri.feedback-capture
- studio.src-tauri.feedback-presses
- packages/studio/features/feedback/src/send/send-feedback.test.tsx
- packages/studio/features/feedback/src/in-app/in-app-feedback.test.tsx
- apps/studio/src-tauri/src/feedback_capture_tests.rs
- apps/studio/src-tauri/src/feedback_press_tests.rs
