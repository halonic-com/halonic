# app.review-deletes-and-new-files

- Status: active
- Since: 0.1.0
- Source: Liam's engine answer, point 1, deletes and new files (HAL-3267); Elena's answer on HAL-3284 (the trash's shape); HAL-3277

When the assistant deletes a file, the review service shall move it to Halonic's trash, if it still holds what the model read, and record it with its baseline and no parts to review. Rejecting the delete shall put the baseline back: from the trash when the trash holds the baseline itself and still has the entry, by writing it otherwise; if something is at that path again, it shall overwrite nothing and hold the file. Accepting the delete shall remove the record and leave the file in the trash. Rejecting a file the assistant created shall remove it, and its undo step shall bring it back.

## Examples

- Given `agents/old.agent.yaml`,
  when the assistant deletes it,
  then it is in the trash, and its record has the old text as baseline and no parts.
- Given that delete,
  when the person rejects it,
  then the file is back from the trash with the same text; when they accept it instead, it stays in the trash.
- Given the assistant changed the file and then deleted it,
  when the person rejects the delete,
  then the file has its text from before both.
- Given another program made a file at that path since,
  when the person rejects the delete,
  then nothing is overwritten and the file is held.
- Given the assistant created `agents/old.agent.yaml`,
  when the person rejects it,
  then it is removed, and undoing that brings it back.
