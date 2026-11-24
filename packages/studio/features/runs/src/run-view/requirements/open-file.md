# runs.run-view.open-file

- Status: active
- Since: unreleased
- Source: option A of HAL-12421, approved by the board (24 Nov); HAL-62 receipt requirements RCPT-2.1 and RCPT-3.4; the button and page words are a team decision under HAL-2282 (HAL-17831)

Where the window can read the files a run saved, the receipt's Items section shall have, under its line, one **Open _name_** button for each file the run saved. Open shall show that file in its own tab, titled with the file's name, under the line "Saved by Run _id_ · read-only": the text of the last file of that name the run's log names, as plain text in a frame nobody can type in. The text shall follow the dashed frame's rules: no Markdown is drawn, a link or image shows as text and loads nothing, and every hidden or direction-changing character is written as its `\uXXXX` escape. When the workspace no longer has the file's text, the tab shall say "Halonic no longer has this file's text."; when the run's log names no file by that name, "This run didn't save a file by that name."; when it can't be read, "Couldn't read _name_" with the reason and **Try again**. Where the window can't read saved files, Items shall have no **Open**.

## Examples

- Given an Acme Weekly report run that saved weekly-report.md,
  when the person presses **Open weekly-report.md** under Items,
  then a tab named weekly-report.md shows the report's text "This week: 12 emails. …" as plain text, read-only.
- Given a saved file with `![x](https://example.com/x.png)` and a U+202E in it,
  when it is opened,
  then the tab shows those characters as text, the U+202E as `\u202e`, and no image is loaded.
- Given a saved file whose text the workspace no longer has,
  when it is opened,
  then the tab reads "Halonic no longer has this file's text."
