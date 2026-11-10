# app.review-accept-reject-file

- Status: active
- Since: 0.1.0
- Source: AI changes 1.2 (Accept file and Reject file) and 1.3 (one undo step each) (HAL-3228); Liam's engine answer, point 1 (HAL-3267); HAL-3277

When the person accepts a file's changes to review, the review service shall remove its record and leave the file alone. When the person rejects them, it shall write the baseline back into the file, or remove a file the assistant created, through a write that checks the file is still as last seen, and then remove the record. If the file changed outside Halonic since it was last seen, it shall leave the file and record alone and hold the file for Compare. Each call shall give back one undo step with each file's record, and its text when it was written, before and after; restoring that step shall put them back, except a file that changed since, which it shall hold.

## Examples

- Given `clerk.agent.yaml` with changes to review,
  when the person accepts the file,
  then the file is unchanged and has no record.
- Given the same,
  when the person rejects the file,
  then it is its baseline again and has no record; a file the assistant created is removed.
- Given another editor changed the file since,
  when the person rejects it,
  then the file and record stay as they are and the file is held.
- Given an accept,
  when its undo step is restored,
  then the record is back and the file was never touched.
- Given a reject and the person typed in the file since,
  when its undo step is restored,
  then nothing is written and the file is held.
