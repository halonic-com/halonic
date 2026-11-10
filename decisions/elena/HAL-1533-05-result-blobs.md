# Decision: a tool result over 256 KB is kept in the blob store, and its event names the blob

- Approval: the HAL-186 implementation plan, approved by Liam on HAL-1515 ("Payloads over 256 KB"); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1533, step 4(d) of the HAL-186 plan

## What changes

`tool.result` gains an optional `resultBlob` (`{ hash, size, mediaType }`, the new `StoredBlob`
type), with its own requirement `events.tool-result-blob`. When it is set, `result` holds only the
start of the result and the whole result is the blob's bytes. Nothing is renamed or removed.

`events.run-log-contract`: its third example listed eight fields that come with the engine. It now
lists nine, with `tool.result.resultBlob`, which is optional and has its own requirement. No
reference field changes. The type test that pins the exact `tool.result` shape gains the optional
field.

`events.upgrade-old-run-logs` gains an example: a log written before the field reads exactly as
written, without `resultBlob`. A new test checks it on the old-shape log.

The engine writes the field through `LargeResultsTurnLog` (requirement
`engine.large-results-to-blobs`). The port ADR's list of run log additions now says where the
"blob hash reference for payloads over 256 KB" went.

## Why

The port ADR planned a blob hash reference for payloads over 256 KB, and the HAL-186 plan puts it
on tool results, because that is where large payloads come from: an export, a long document, a big
search. Every reader of a run (timeline, summary, `read_run`, replays) reads the whole log, so one
large result would slow all of them down.

The field is on `tool.result` rather than a general wrapper for any event, so a reader that
predates it still reads a valid event, with a short `result`. The log keeps the first 2,000
characters, so a reader that never opens the blob still sees what the tool answered. The shape
copies `BlobRef` from `@halonicjs/ports`, which `@halonicjs/events` may not import
(docs/adr/2026-11-09-api-types-stand-alone.md).

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.upgrade-old-run-logs
- packages/core/events/src/run-event.test.ts
