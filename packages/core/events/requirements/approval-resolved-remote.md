# events.approval-resolved-remote

- Status: active
- Since: unreleased
- Source: HAL-10852, relay part 2 of HAL-10833 (Liam's conditions on HAL-10835 and HAL-10847)

The events package shall let an `approval.resolved` event say in `by` that a person answered from a remote device, as `"remote-device"`, next to `"person"` and `"rule"` (`events.approval-resolved-by`). It does not say which device or which person, so the log holds no personal data.

## Examples

- Given an `approval.resolved` event with `by: "remote-device"`,
  when its type is checked,
  then it is a valid run event.
