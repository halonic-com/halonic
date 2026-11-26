# studio.feedback-window

- Status: active
- Since: unreleased
- Source: HAL-19240; Liam's condition 1 on HAL-19671 (Halonic Inbox and Messenger don't listen for the shortcut); `studio.feedback-send`

The desktop app shall start the feedback shortcut only in Studio's main window, sending as
`studio.feedback-send` says, and shall not start it in Halonic Inbox or Halonic Messenger, which have
no folder to send from. The app shall give Settings › Feedback the number of feedbacks waiting, and
Settings whether Studio is connected to Paperclip, as the main window counts it.

## Examples

- Given the Halonic Inbox window,
  when the person presses Ctrl+Shift+F,
  then nothing is asked of the shell and the keys go on to the window.
- Given three feedbacks waiting,
  when the person opens Settings › Feedback,
  then it can say "3 waiting to send".
