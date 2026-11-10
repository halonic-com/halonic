# app.review-other-writes-merge

- Status: active
- Since: 0.1.0
- Source: AI changes 1.4 (HAL-3228); Liam's engine answer, point 1, the write hook (HAL-3267); Liam's plan review on HAL-3286 (change 4, one change to a file at a time); HAL-3277

When anything other than the assistant writes a file that has a record (typing, a structured editor, Compare, a reload, Undo these changes), the review service shall move its baseline by a three-way merge with the file before the write as base, the baseline as ours and the file after the write as theirs, taking theirs where they conflict, and shall record the file's new digest. A write that creates or deletes the whole file shall make the baseline the file, so the record goes. A write that doesn't happen, such as removing a file that is already gone, shall leave the record alone. If the file changed outside Halonic since it was last seen, the record shall stay as it is and the file shall stay held for Compare. A write and an Accept or Reject on the same file shall run one after the other.

## Examples

- Given the assistant changed line 3 of `triage.workflow.yaml`,
  when the person edits line 9 and it is saved,
  then the baseline has the new line 9 and the only change to review is still line 3.
- Given the same,
  when the person edits line 3,
  then line 3 counts as accepted and the file has no changes to review.
- Given the same,
  when Undo these changes writes the original text back,
  then the file has no changes to review.
- Given the assistant created `triage.workflow.yaml`,
  when the person adds a line to it,
  then the whole file counts as accepted.
- Given a save and a Reject of the same file at once,
  when both finish,
  then the save went first and the Reject kept the person's line.
- Given the assistant changed line 3 and someone outside Halonic then changed line 9,
  when the person edits line 6 and it is saved,
  then the record stays as it was and a Reject of line 3 is held for Compare.
- Given the assistant deleted `triage.workflow.yaml`,
  when something removes it again,
  then the delete is still a change to review.
