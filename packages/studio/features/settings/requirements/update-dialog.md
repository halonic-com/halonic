# settings.update-dialog

- Status: active
- Since: unreleased
- Source: HAL-19364 (the board's request on HAL-10); HAL-19365 (plan review); HAL-19579 (visual check)

The Update available dialog shall show the update's state in About Halonic's words, which name the
offered version, with no heading that repeats it, and
what changed in it with a link to its release notes, and shall offer one confirming button for where
the update is: **Install** when it isn't downloaded, which downloads it with a progress bar and
**Cancel download** and becomes **Restart** once it is ready; **Restart** at once when it is already
downloaded, which goes through the restart flow (`settings.restart-flow`); **Try again** after a
failed download, with the reason; and **Close** when its signature was refused. When the updater
doesn't answer a press, the dialog shall say "Halonic's updater didn't answer." with **Try again**.
What changed shall be shown only as plain text, never as Markdown, HTML or links made from it; with
no notes but a link, the dialog shall say "The release notes say what changed.", and with neither, it shall leave What changed out.

## Examples

- Given 0.1.1 is available with notes,
  when the person opens the dialog and presses **Install**,
  then it downloads, shows its progress and the notes, and then offers **Restart**.
- Given 0.1.1 is already downloaded,
  when the person opens the dialog,
  then it offers **Restart** and no **Install**.
- Given 0.1.1 is available,
  when the person opens the dialog,
  then "Halonic 0.1.1 is available. You have 0.1.0." names the version and no heading says "Halonic 0.1.1".
- Given notes with `<script>` in them,
  when the dialog shows them,
  then they read as that text and no element is made from them.
