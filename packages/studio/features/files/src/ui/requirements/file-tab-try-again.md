# files.ui.file-tab-try-again

- Status: active
- Since: unreleased
- Source: HAL-11642 (states audit gap 4); microcopy 1.4 and 22 F13

When a file's tab can't read the file, the Files view shall show "Couldn't open this file" with a reason that is the error's own sentence only when the error has a kind, and otherwise "Halonic ran into a problem it can't explain yet.", and **Try again**, which reads the file again in the same tab.

## Examples

- Given the host can't read the file and says "Access was denied." as a kinded error, then the tab reads "Couldn't open this file" with "Access was denied." and **Try again**.
- Given the read fails with a system message such as "EIO: i/o error", then the tab reads "Couldn't open this file" with "Halonic ran into a problem it can't explain yet." and never shows the system message.
- Given the user presses **Try again** and the file can be read now, then the editor opens on its text in the same tab.
