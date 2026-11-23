# Decision: ready_for_review waits about 6 seconds, not 20

- Task: HAL-16437
- Approval: Liam approves this note in review
- Kind: internal

## What changes

- `paperclip.ready-for-review` reads a running check for about 6 seconds instead of about 20
  before it answers `RUNNING` with the check's id. It reads every 2 s instead of every 4 s, and
  each request to the precheck service gives up after 3 s instead of 5 s.
- The plugin version goes 0.7.0 → 0.7.1, so the board can install the fix.

## Why

The first real calls, on 23 Nov against the live service, both failed with "Tool execution timed
out" from Paperclip's tool bridge before the tool could answer, although the service answered in
about a millisecond. The bridge gives up after about 15 s, not the 30 s the tool was built for, so
an agent never got the check's id and the check's result was lost. With 6 s of waiting and 3 s per
request, a call ends within about 9 s. A check takes about 30 s, so an agent now calls a few times
with the `checkId` instead of once.

## Tests

No test was weakened or skipped. The `RUNNING` test now expects the id after three requests
instead of five, and the saved call duration
in the metrics test is 4,000 ms instead of 8,000 ms (two 2 s pauses instead of two 4 s ones), matching
the shorter wait; both keep their `expect` calls.

## Covers

- paperclip.ready-for-review
