# Decision: a tool result says what its tool can do and what one call sends

- Approval: HAL-2831, Liam's decision of 10 Nov; the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-2831, asked for by the runs list (HAL-2829)

## What changes

`tool.result` gains two optional fields, with their own requirement `events.tool-result-risk`:
`risk` (`read`, `write` or `send`) and `noun` (`{ one, many }`, such as `email` / `emails`). Both
are copied from the tool's integration sheet when the call ends. The requirement also gives the
rules for readers that say what a run sent: only `risk: "send"` with `outcome: "ok"` counts as
sent, one call is one noun, `outcome: "unknown"` is "may have sent", a missing `risk` means the
log doesn't say (never "sent nothing"), and a send without a `noun` is left out. Nothing is
renamed or removed.

`events.run-log-contract`: its third example listed six fields that come with the engine. It now
lists eight, with `tool.result.risk` and `tool.result.noun`, each optional and with its
requirement. No reference field changes. The type test that pins the exact `tool.result` shape
gains the two optional fields.

`events.upgrade-old-run-logs` gains an example: a log written before the two fields reads exactly
as written, with neither field added. A new test checks it on the old-shape log.

The engine writes `risk` from this pull request on (requirement `engine.turn-logs-risk`), for a
server's tool whose listing gives one. For an integration, that is the sheet's risk: the
integration kit checks that the declared tools match the sheet. Until HAL-998 plugs the host's
listing rules into the engine, an `http` or `stdio` server's own `risk` is copied as it listed it.
That is safe for readers: nothing reads "sent" from `risk` without a `noun`, and `noun` only
comes from a sheet. The engine writes `noun` once the integration format has it
(HAL-2836).

## Why

The ✓ Done row of `halonic runs` and the receipt of `halonic run` should say "Sent 1 email", and
the run log is the only record they read. Two flat fields instead of one `sent` block, because
`sent: { risk: "read" }` would read wrong on a read call, and `risk` alone is useful, for example
to show writes. Copying when the call ends keeps the log the record even if the sheet changes or
the integration is removed later. Storing the plural means readers never make plurals themselves.
Logs written before the change read as before.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.upgrade-old-run-logs
- packages/core/events/src/run-event.test.ts
