# studio.feedback-window

- Status: active
- Since: unreleased
- Source: HAL-19240; the board's report on HAL-20013 (the shortcut does nothing in Halonic Messenger), which replaces Liam's condition 1 on HAL-19671; `studio.feedback-send`; `studio.window-content`

The desktop app shall start the feedback shortcut in Studio's main window, in Halonic Inbox and in
Halonic Messenger, sending as `studio.feedback-send` says. In Halonic Inbox and Halonic Messenger,
the folder shown is the folder the window opened (`studio.window-content`), and the selection
overlay, the Send feedback dialog and its toasts show in that window. A window that opened no
folder shall not start the shortcut. The app shall give Settings › Feedback the number of feedbacks
waiting, and Settings whether Studio is connected to Paperclip, as the main window counts it.

## Examples

- Given the Halonic Messenger window, which opened the folder acme,
  when the person presses Ctrl+Shift+F while acme is connected to Paperclip,
  then the shell is asked to start a capture of that window.
- Given the Halonic Inbox window, which opened no folder,
  when the person presses Ctrl+Shift+F,
  then nothing is asked of the shell and the keys go on to the window.
- Given three feedbacks waiting,
  when the person opens Settings › Feedback,
  then it can say "3 waiting to send".
