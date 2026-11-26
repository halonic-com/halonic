# settings.update-dialog

- Status: active
- Since: unreleased
- Source: HAL-19364 (the board's request on HAL-10); HAL-19365 (plan review)

The Update available dialog shall show the offered version, its state in About Halonic's words, and
what changed in it with a link to its release notes, and shall offer one confirming button for where
the update is: **Install** when it isn't downloaded, which downloads it with a progress bar and
**Cancel download** and becomes **Restart** once it is ready; **Restart** at once when it is already
downloaded, which goes through the restart flow (`settings.restart-flow`); **Try again** after a
failed download, with the reason; and **Close** when its signature was refused. When the updater
doesn't answer a press, the dialog shall say "Halonic's updater didn't answer." with **Try again**.
What changed shall be shown only as plain text, never as Markdown, HTML or links made from it; with
none, the dialog shall say "The release notes say what changed."

## Examples

- Given 0.1.1 is available with notes,
  when the person opens the dialog and presses **Install**,
  then it downloads, shows its progress and the notes, and then offers **Restart**.
- Given 0.1.1 is already downloaded,
  when the person opens the dialog,
  then it offers **Restart** and no **Install**.
- Given notes with `<script>` in them,
  when the dialog shows them,
  then they read as that text and no element is made from them.
