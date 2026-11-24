# ports.action-records

- Status: active
- Since: unreleased
- Source: stream HAL-17488, the architecture note on HAL-17491 (revision 12, section 4.2), Liam's port-shape OK on HAL-17533 (append-only, a retention number, "runs at most once" is page logic); ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516

The ports package shall have an `ActionRecords` port through which Studio appends an action event to its request's record and reads a request's events, oldest first. It shall have no call that changes or deletes an event, and its events shall be every action event kind except `action.requested`, which is a run event.

The port's documentation shall state that the record lives outside every workspace in files only the user can read, that an adapter refuses with a `RangeError` and doesn't write an event the action events' allow-list refuses, that an adapter deletes a finished request's record 90 days after its `action.finished`, and that "a request runs at most once" is page logic read from the record, not a guarantee of the shell.

## Examples

- Given the `ActionRecords` port,
  when its members are read,
  then they are exactly `append` and `read`.
- Given an `action.requested` event,
  when it is passed to `append`,
  then it doesn't compile.
