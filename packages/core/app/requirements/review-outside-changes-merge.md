# app.review-outside-changes-merge

- Status: active
- Since: 0.1.0
- Source: AI changes 1.10 (HAL-3228); Liam's open question on HAL-3951; option 1 with a clean merge only, Liam's decision on HAL-4030; HAL-3964

When the file of a record has changed outside Halonic since it was last seen, found by a watch batch, on opening the workspace or before a write (a person's or the assistant's), the review service shall move its baseline by a three-way merge with the file as last seen as base, the baseline as ours and the file now as theirs, and record the file's new digest, if the merge has no conflict and the file exists both as last seen and now. Otherwise the record shall stay as it is and the file shall stay held for Compare. The record shall keep its card and its other marks, and a merge that makes the baseline the file shall remove the record, as an Accept or Reject of the last change does.

## Examples

- Given the assistant changed line 3 of `triage.workflow.yaml`,
  when VS Code changes line 9,
  then the baseline has the new line 9, the only change to review is still line 3, and a Reject of line 3 is not held.
- Given the same,
  when `git pull` changes line 3,
  then the record is unchanged and the file is held for Compare.
- Given the same,
  when the file is deleted outside Halonic,
  then the file is held for Compare.
- Given a record from before this change, which keeps no text of the file as last seen,
  when the file is changed outside Halonic,
  then the file is held for Compare, as before.
- Given the assistant changed line 3 and someone outside Halonic then changed line 9,
  when the person edits line 6 and it is saved before the watch batch arrives,
  then both lines are in the baseline and only line 3 is left to review.
- Given the assistant changed line 3,
  when `git checkout` undoes it outside Halonic,
  then the record goes, the listeners hear of it and nothing is left to review.
- Given the assistant changed line 3 while the workspace was untrusted,
  when VS Code changes line 9,
  then the record is still marked written untrusted.
- Given the assistant changed line 3 and VS Code then changed line 9,
  when the assistant writes the file again,
  then it is written and the baseline keeps line 9.
