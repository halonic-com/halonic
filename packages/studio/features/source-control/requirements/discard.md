# source-control.discard

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); req-source-control (HAL-110) revision 4, `source-control.changes.discard-with-warning` and `source-control.changes.discard-per-file-and-hunk`; save model 3.1, 3.3 and 3.4 (HAL-1102)

The Changes page shall give each changed file Undo these changes, which at once puts the file back as the last version has it, without a question: a changed or deleted file gets its text back and a new file is deleted. Before it changes anything, Halonic shall keep a copy of the text it throws away in `.studio/discarded`, which git ignores. When the copy can't be kept, nothing shall be changed and the page shall ask one question, "Undo changes to <name>?" with "Halonic couldn't keep a copy, so this can't be undone.", where Cancel has focus and Undo changes is in danger red, and Undo changes shall go on without a copy and without an Undo. When the file's own Discard can't keep a copy, the page shall say "Couldn't discard these changes." and why. A toast "Undid changes to <name>." with Undo shall stay for 10 seconds, pausing while the pointer or focus is in it, and Undo brings the files back as one undo step or, when a file changed in the meantime, shows a toast "Couldn't put the changes back" and why. While one Undo these changes runs, another shall be ignored. Nothing shall be written when the file changed since the page read it, and a file that another program added to a version, or that can't be read as text, can't be discarded here and the page shall say why.

While the developer view is on (Settings → Developer → Show files and branches), the same button shall read Discard, and the lines under Advanced shall each part have Discard this part. That puts back only that part, keeps the rest of the file, and shows the toast "Discarded this part" with Undo. While the developer view is off, there shall be no Discard and no Discard this part.

## Examples

- Given `hubs/sales/hub.yaml` is changed,
  when the person presses Undo these changes,
  then `hub.yaml` is back as last committed, there is no "Are you sure?" question, a copy of the changed text is kept, and the toast says "Undid changes to sales." with Undo.
- Given the person presses Undo on that toast, then `hub.yaml` has their changes again.
- Given an untracked `skills/tone/SKILL.md`, when the person presses Undo these changes, then the file is deleted, and Undo on the toast writes it back.
- Given a deleted file, when the person presses Undo these changes, then it is back, and Undo on the toast deletes it again.
- Given Halonic can't keep a copy of the changed text,
  when the person presses Undo these changes,
  then nothing is changed, the question "Undo changes to sales?" opens with Cancel focused, and Cancel leaves the file as it is.
- Given that question is open, when the person presses Undo changes, then the file is back as last committed and the toast has no Undo.
- Given the file was edited in another editor after the page read it, then nothing is changed and the page says the file changed while they were looking.
- Given the developer view is on and `hub.yaml` has two changed parts,
  when the person presses Discard this part on the first,
  then only that part is back as last committed, the second stays, and the toast offers Undo.
- Given the developer view is off, then the page has no Discard and no Discard this part, though Advanced still lists the lines.
