# shell.welcome-cant-open

- Status: active
- Since: 0.1.0
- Source: req-shell `shell.welcome.cant-open` (HAL-110), microcopy 3.2; HAL-1291

If a folder fails to open from the welcome screen, then the shell shall show "Can't open *folder*: *reason*" under the text in the danger colour, read it to screen readers, and make **Open folder** usable again so the user can pick another folder. The next press of **Open folder** shall clear the message.

## Examples

- Given the user picks `/work/old` and it fails with "the folder is gone.",
  then the welcome screen shows "Can't open /work/old: the folder is gone." and **Open folder** works again.
- Given that message is showing,
  when the user presses **Open folder** again,
  then the message goes away while the next folder opens.
