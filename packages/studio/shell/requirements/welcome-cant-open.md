# shell.welcome-cant-open

- Status: active
- Since: 0.1.0
- Source: req-shell `shell.welcome.cant-open` (HAL-110), microcopy 2, 3.2 and 22 F13; states-flow-map W4 to W6 and D7 (HAL-5878); HAL-1291

If a folder fails to open from the welcome screen, then the shell shall show "Can't open *folder*: *reason*" under the text in the danger colour, read it to screen readers, and make **Open folder** usable again so the user can pick another folder. The next press of **Open folder** shall clear the message.

The reason shall depend on the error's kind: `not_found` reads "the folder is gone.", `denied` reads "you don't have permission to read it.", an error without a kind reads "Halonic ran into a problem it can't explain yet." with **Copy details**, which copies the error, and any other kind reads the error's own message as a sentence.

## Examples

- Given the user picks `/work/old` and it fails with "the folder is gone.",
  then the welcome screen shows "Can't open /work/old: the folder is gone." and **Open folder** works again.
- Given that message is showing,
  when the user presses **Open folder** again,
  then the message goes away while the next folder opens.
- Given opening `/work/acme` fails with an error that has no kind,
  then the welcome screen shows "Can't open /work/acme: Halonic ran into a problem it can't explain yet." and **Copy details**.
