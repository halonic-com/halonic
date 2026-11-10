# app.review-accept-reject-change

- Status: active
- Since: 0.1.0
- Source: AI changes 1.2 (per change on an item page) and 1.3 (HAL-3228); Elena's `revertParts` and `describeItemChange` (HAL-3278); HAL-3277

When the person accepts one change on an item page (a line `describeItemChange` gives from the baseline to the file, with the item paths it covers), the review service shall set those paths in the baseline to the file's values and leave the file alone. When the person rejects one change, it shall set those paths in the file back to the baseline's values, through a write that checks the file is still as last seen. Both shall keep the rest of each text, its comments and formatting as they are. If the file no longer holds the text the change was shown from, it shall change nothing and say the changes are stale. If the assistant created the file, the change has no item paths, or the file or its baseline can't be read as YAML, it shall change nothing and say the change can't be decided on its own. If the file changed outside Halonic since it was last seen, it shall change nothing and hold the file. Each call shall give back one undo step.

## Examples

- Given the assistant changed the model and the name of agent `triage`,
  when the person accepts the model change,
  then the file is unchanged and the only change to review is the name.
- Given the same,
  when the person rejects the model change,
  then the file has the old model and the new name, with its comments kept, and the name is still to review.
- Given the assistant created `triage.agent.yaml`,
  when the person accepts its "New" line,
  then nothing changes and the answer is that it can't be decided on its own.
