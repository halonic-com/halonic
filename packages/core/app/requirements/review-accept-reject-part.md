# app.review-accept-reject-part

- Status: active
- Since: 0.1.0
- Source: AI changes 1.2 (per part, as in Cursor and VS Code) and 1.3 (HAL-3228); Liam's engine answer, point 1 (HAL-3267); Elena's answer on HAL-3284 (`applyLineChanges`, the stale outcome); HAL-3277

When the person accepts one part of a file's changes to review (one line change from its baseline to the file), the review service shall apply it to the baseline and leave the file alone. When the person rejects one part, it shall write the file as the baseline with every other part applied, through a write that checks the file is still as last seen; rejecting the only part of a file the assistant created shall remove the file. If the file or the baseline is no longer what the parts were shown from, or the part isn't there, it shall change nothing and say the parts are stale. If the file changed outside Halonic since it was last seen, it shall change nothing and hold the file. Each call shall give back one undo step.

## Examples

- Given the assistant changed lines 3 and 8 of `triage.workflow.yaml`,
  when the person accepts the first part,
  then the file is unchanged and the only change to review is line 8.
- Given the same,
  when the person rejects the first part,
  then line 3 is as before and line 8 is still to review.
- Given the person rejected one part since the parts were shown,
  when they click Accept on the old list,
  then nothing changes and the answer is stale.
- Given the assistant changed lines 3, 6 and 8, and the person accepted the first part since the parts were shown,
  when they click Reject on the old list's second part,
  then nothing changes and the answer is stale.
- Given the assistant created `triage.workflow.yaml`,
  when the person rejects its only part,
  then the file is removed.
