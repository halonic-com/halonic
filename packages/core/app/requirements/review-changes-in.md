# app.review-changes-in

- Status: active
- Since: 0.1.0
- Source: AI changes 1.2 (the item bar, the file's bar and the chat card) (HAL-3228); Liam's plan review on HAL-3286 (change 5, unsaved text); Elena's answer on HAL-3284 (the digest it was worked out from); HAL-3277

The review service shall give the changes to review in one file as line changes from its baseline to the saved file, or to the editor's unsaved text when that is given, with the digest of the baseline and the text they were worked out from, and shall give them for each file one chat card covers.

## Examples

- Given the assistant changed lines 3 and 8,
  when the editor asks with unsaved text that also changes line 10,
  then it gets three parts, and deciding one of them says stale.
- Given a file without changes to review,
  when they are asked for,
  then there are none.
- Given card `k1` covers `a.yaml` and `triage.workflow.yaml`,
  when the chat asks for `k1`,
  then it gets both files with their parts, sorted by path.
