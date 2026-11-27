# action-send-tauri.records

- Status: draft
- Since: unreleased
- Source: HAL-18125; architecture note on HAL-17491 (4.2); the `ActionRecords` port (`ports.action-records`)

The Tauri action records shall implement `ActionRecords` by calling the shell's `action_record_append` with `{ event }` and `action_record_read` with `{ request }`, and pass the `ActionRecords` contract suite against a mocked `invoke`. They shall check each event against the action events' allow-list before they send it, and reject an event it refuses, or `action.requested`, with a `RangeError` without calling the shell; a `refused-event` from the shell, for an event or a request id, shall reject with a `RangeError` too. They shall refuse, as `malformed-answer`, a read whose answer isn't a list of record events of the request asked for, and any other failure of the shell shall reject with an `ActionShellError` as for the sender.

## Examples

- Given an `action.step.started` event with an extra `authorization` field,
  when it is appended,
  then it rejects with a `RangeError` and the shell receives no call.
- Given the shell answers a read with another request's event,
  when `read("req-1")` is called,
  then it rejects with an `ActionShellError` of failure `malformed-answer`.
