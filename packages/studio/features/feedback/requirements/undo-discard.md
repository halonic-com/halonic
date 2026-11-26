# feedback.undo-discard

- Status: active
- Since: unreleased
- Source: HAL-19240 (Liam's approval of the plan on HAL-19671); the toast's words in `feedback.send-toasts`

When the person closes the Send feedback dialog with Cancel, the ✕ or Esc with text written, the
Feedback feature shall end the feedback as `feedback.send-window` says and show "Feedback discarded"
with "Undo" in the window's toast region. When the person presses Undo and no other feedback shows,
the feature shall show the dialog again with the text and the crop it had, without asking the shell
for the crop. When nothing was written, closing the dialog shall show no toast.

## Examples

- Given the dialog with "Run list jumps" written,
  when the person presses Cancel,
  then the dialog goes, the shell is asked to end, and "Feedback discarded" shows with "Undo".
- Given that toast,
  when the person presses Undo,
  then the dialog shows "Run list jumps" and the same crop, and the shell isn't asked for it again.
- Given the dialog with nothing written,
  when the person presses Esc,
  then the dialog goes and no toast shows.
