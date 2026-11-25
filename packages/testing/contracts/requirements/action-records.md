# contracts.action-records

- Status: active
- Since: unreleased
- Source: stream HAL-17488, the architecture note on HAL-17491 (revision 12, section 4.2), Liam's port-shape OK on HAL-17533; ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516; requirement `ports.action-records`

Where an adapter implements `ActionRecords`, it shall pass this suite. It shall read nothing for a request with no record, read a request's events back oldest first and apart from another request's, refuse with a `RangeError` and write nothing for an event the action events' allow-list refuses or an `action.requested` event, and keep what was appended whatever the caller later does with its object.

The `FakeActionRecords` in this package shall pass the suite, so the stepper can be built before the shell's record files exist.

## Examples

- Given a step-started event with an added `authorization` field,
  when it is appended,
  then the append rejects with a `RangeError`, and the request's record is still empty.
- Given events appended for `req-1`, then `req-2`, then `req-1`,
  when `req-1` is read,
  then it gives its two events in that order and none of `req-2`'s.
