# studio.src-tauri.crates.action-send.action-records

- Status: draft
- Since: unreleased
- Source: HAL-18125; architecture note on HAL-17491 (4.2); the `ActionRecords` port (`ports.action-records`)

The shell shall keep each action request's record as one JSON-lines file in its records folder, named by the SHA-256 of the request's id, with the folder readable by the user only and each file readable and writable by the user only. The shell shall write an event only when the action events' allow-list takes it, with the same fields and limits as `checkActionEvent` of `@halonicjs/events`, and refuse any other event, `action.requested` included, as `refused-event` without writing anything. When it reads a record, it shall return the request's events oldest first and drop every line the allow-list doesn't take or that names another request. The shell shall refuse a link, a hard link or anything but a plain file in a record's place, and a link in the records folder's place, rather than follow or wait on it, also when it is swapped in between the check and the open, refuse an event that would grow a record past 1 MiB as `record-full`, and delete a record 90 days after its first `action.finished`.

## Examples

- Given an `action.step.started` event with an extra `authorization` field,
  when the page appends it,
  then it is refused as `refused-event`, the refusal names only the field, and no file is written.
- Given the request id `../../escape`,
  when its first event is appended,
  then the record is one file in the records folder whose name is 64 hex characters and `.jsonl`.
- Given the record's file is replaced by a hard link to a file elsewhere,
  when the page appends an event or reads the record,
  then the call is refused as `storage` and the other file is unchanged.
- Given a request that finished on 25 Nov 2026,
  when its record is read 90 days later,
  then the file is deleted and the record reads as empty.
