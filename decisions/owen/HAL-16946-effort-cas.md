# Decision: task effort writes skip a changed task and report changes from the payload

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16946
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iyP95oG56F5jGjqb5T2URLDaZQTQWcv5TD4AT1OTtalTNcZfMtTTmw47ZajFKtvzDSr8At454QOfyfydRDRhCQ==

Follow-ups from Julian's guard check on HAL-16876. Both requirements gain
behaviour; no example is removed or weakened.

- `paperclip.task-effort-writes`: the plugin reads the task's overrides again
  right before its `PATCH` and sends nothing when they changed since it read
  the task, so a person's effort or model change made in between isn't
  overwritten. Core has no version check on a task, so this narrows the
  window rather than closing it.
- `paperclip.task-effort-guard`: the effort comes from the event's payload
  when the payload carries the overrides, so a change undone before the event
  is handled is still reported; a change where either side isn't one of
  Paperclip's words is tagged `changed`, not `raised` or `lowered`.

## Covers

- paperclip.task-effort-writes
- paperclip.task-effort-guard
