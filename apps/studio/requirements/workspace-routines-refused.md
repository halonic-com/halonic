# studio.workspace-routines-refused

- Status: draft
- Since: unreleased
- Source: flow check 38 (C552-5, HAL-15269); `app.scheduler-keeps-refused-starts`; `studio.engine-routines`

The Routines feature's host shall tell its listeners each time the engine's routine tick adds to a routine's skip records, also when no run started, so an open Runs view and the Routines list read them again.

## Examples

- Given the Runs view is open and a routine's 19:41 start is refused,
  when the engine records the skip,
  then the host's listeners are told, and stop being told once they stop listening.
