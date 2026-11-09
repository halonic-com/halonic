# events.approval-resolved-by

- Status: active
- Since: 0.1.0
- Source: [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "E5: approvals routed by callId"; task HAL-1525

The events package shall let an `approval.resolved` event say who resolved the approval in an optional `by`: `"person"` when a person answered, or `"rule"` when a rule answered without asking anyone. It does not say which person, so the log holds no personal data. Logs written before the field existed read as before.

## Examples

- Given an `approval.resolved` event with `by: "person"`,
  when its type is checked,
  then it is a valid run event.
- Given an `approval.resolved` event with `by: "rule"`,
  when its type is checked,
  then it is a valid run event.
- Given an `approval.resolved` event without `by`,
  when its type is checked,
  then it is a valid run event.
