# settings.update-dialog-versions

- Status: active
- Since: unreleased
- Source: HAL-19545; the board's request on HAL-19542

When the offered update is more than one version newer than the installed one, the Update available
dialog shall show what changed in every version after the installed one up to the offered one, each
under its version, newest first, as plain text. When the update's list of notes stops above the
installed version, the dialog shall say "The release notes say what changed in earlier versions."
When the update has no list, the dialog shall show the offered version's own notes.

## Examples

- Given Halonic 0.4.1 is installed and 0.4.4 is offered with notes for 0.4.4, 0.4.3 and 0.4.2,
  when the person opens the dialog,
  then it shows Halonic 0.4.4, Halonic 0.4.3 and Halonic 0.4.2 with their notes, in that order.
- Given the list has only 0.4.4 and 0.4.3,
  when the person opens the dialog,
  then it shows those two and says the release notes say what changed in earlier versions.
