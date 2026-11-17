# shell.save-copy-details

- Status: active
- Since: unreleased
- Source: HAL-11642 (states audit gap 4); microcopy 22 F9 and F13

If a save fails for a reason Halonic can't name, then its error toast "Couldn't save *name*." shall offer **Copy details** after **Try again**, which puts the toast's title and the error's code and message on the clipboard and leaves the toast open. A save that fails for a reason Halonic names shall offer no Copy details.

## Examples

- Given a save of Support reply fails with "EIO: write failed",
  when the user presses Copy details,
  then the clipboard holds "Couldn't save Support reply." and "EIO: write failed", and the toast stays.
- Given a save of Support reply fails because the disk is full,
  then its toast offers Try again and no Copy details.
