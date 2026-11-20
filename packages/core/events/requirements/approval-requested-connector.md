# events.approval-requested-connector

- Status: active
- Since: unreleased
- Source: HAL-11701, decided on HAL-11698 (option a); read by Studio's approval card (INBOX-CARD-24)

The `approval.requested` event shall be able to name the connector the tool comes from in an optional `connector`, next to `tool`. `tool` stays the bare tool name, as the model was offered it; a reader that wants to show where the tool comes from reads `connector` and does not split a `connector__tool` name. Logs written before the field existed stay valid and read without it.

## Examples

- Given an `approval.requested` log line with `tool: "send_mail"` and `connector: "mail"`,
  when the line is parsed,
  then both come back as written.
- Given an `approval.requested` log line written before `connector` existed,
  when the line is parsed,
  then it reads as before, with no `connector`.
- Given the type of `approval.requested`,
  when `connector` is checked,
  then it is an optional string.
