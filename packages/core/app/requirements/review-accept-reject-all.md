# app.review-accept-reject-all

- Status: active
- Since: 0.1.0
- Source: AI changes 1.2 (the chat card, "n items to review") and 1.3 (HAL-3228); HAL-3277

When the person picks Accept all or Reject all on a chat card, or for the whole chat, the review service shall accept or reject every file that card or chat has a record for, as one undo step that lists each file, and shall leave the files of other cards and chats alone.

## Examples

- Given card `k1` covers `clerk.agent.yaml` and `triage.workflow.yaml`, and card `k2` covers `a.yaml`,
  when the person picks Reject all on `k1`,
  then both files are their baselines again, `a.yaml` keeps its record, and restoring the one step brings both back.
- Given chat `c1` has cards `k1` and `k2`, and chat `c2` has `k3`,
  when the person accepts the whole of `c1`,
  then only `k3`'s file keeps a record, and no file changed.
