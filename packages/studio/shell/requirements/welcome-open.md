# shell.welcome-open

- Status: active
- Since: 0.1.0
- Source: req-shell `shell.welcome.open-action` (HAL-110), flow-workspace 2.1, microcopy 3.2; HAL-1291

While no workspace is open, the shell shall show the welcome screen titled "Halonic Studio" with "Your workspace is a folder of plain files. Local first, private, and yours." and the primary button **Open folder**, centred with no sidebar and no tabs, with focus on **Open folder**. When the user presses **Open folder**, the shell shall call the app's folder opener, and while it runs the button shall read "Opening…" and be busy: it keeps focus and ignores presses. If the user cancels the folder picker, then the welcome screen shall stay as it was, with no message.

## Examples

- Given the desktop app with no workspace open,
  then the window shows "Halonic Studio", the two sentences and **Open folder**, which has focus.
- Given the user pressed **Open folder** and the folder is still opening,
  when they press it again,
  then nothing more happens and it reads "Opening…".
- Given the user cancels the folder picker,
  then the welcome screen shows **Open folder** again and no error.
