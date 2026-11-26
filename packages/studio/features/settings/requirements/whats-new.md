# settings.whats-new

- Status: active
- Since: unreleased
- Source: HAL-19364 (the board's request on HAL-10); HAL-19365 (plan review)

When the window opens at the first start after an update, it shall show the dialog "Updated to Halonic *0.1.1*",
which says the version it came from and what's new in it, as plain text, with a link to its release
notes, and **Close**. It shall show once for that version: not again when the window remounts or the
page reloads. Where the page can't remember it, the dialog shall show rather than be skipped.

## Examples

- Given the last start installed 0.1.1 over 0.1.0,
  when the window opens,
  then the dialog says "Updated to Halonic 0.1.1" and "You were on Halonic 0.1.0." with what's new.
- Given the dialog for 0.1.1 has shown,
  when the page reloads,
  then it doesn't show again.
