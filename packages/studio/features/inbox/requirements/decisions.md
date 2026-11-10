# inbox.decisions

- Status: active
- Since: 0.1.0
- Source: HAL-1218; E5 in the [HAL-186 plan](/HAL/issues/HAL-186#document-implementation-plan) (approvals routed by `callId`); [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.2 and 2.3

The Inbox shall send your answer to the run that waits for it: Approve as `approve`, Reject as `reject`, Ask for changes as `reject` with the note as `{ comment }`, and any other answer a `wait` step takes by its event name. An answer to a tool call shall name its call id, so the engine refuses an answer that no longer matches the call the run waits on. An answer to a `wait` step names no call.

## Examples

- Given a tool call item for `call-1` in run `r1`,
  when you approve it,
  then `approve` is sent to `r1` with the call id `call-1` and no payload.
- Given the same item,
  when you ask for changes with the note "Use the shorter title",
  then `reject` is sent to `r1` with `{ comment: "Use the shorter title" }` and the call id `call-1`.
- Given Acme's `review` item,
  when you reject it,
  then `reject` is sent to its run with no call id.
- Given a `wait` step that takes `escalate`,
  when you answer Escalate,
  then `escalate` is sent to its run with no call id.
