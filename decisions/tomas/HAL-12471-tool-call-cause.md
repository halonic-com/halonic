# Decision: a failed tool call logs why, when the engine knows

- Approval: Liam approved the plan with changes on HAL-12575; he approves this note in his review of this pull request on HAL-12471
- Kind: internal
- Task: HAL-12471

## What changes

`tool.result` gains an optional `cause` (new requirement `events.tool-result-cause`): `time-limit`
with `seconds`, `engine-stopped`, `not-made` with a reason (`not-connected`, `tool-gone`,
`sending-off`, `bad-arguments`), or `connector-not-started` with a reason and an optional `name`.
`@halonicjs/events` exports `ToolFailureCause`, `ToolNotMadeReason`, `ConnectorStartReason` and a
reader, `toolFailureCauseOf`, that reads a cause it doesn't know, a field of the wrong type or a
missing field as absent. The engine sets the cause where it knows it (new requirement
`engine.tool-result-cause`). Nothing is renamed or removed, and the texts the model hears don't
change.

`events.run-log-contract`: its third example listed "the twenty-six fields that come with the
engine". It now lists twenty-seven, with `tool.result.cause` and its requirement
`events.tool-result-cause`. No reference field changes, and logs without `cause` read as before.

## Why

Studio's step panel can only say "broke off without an answer" today. With the cause it can say
"the tool `search_pages` (*Notion*) didn't answer within 60 seconds" (HAL-12429, microcopy 1.6,
E1), and later name a missing program or secret.

- A union on `code`, not `RunFailureCause`: that one belongs to `run.failed`, its `kind` is one of
  the kit's error kinds and its `detail` holds strings only, so `seconds` would lose its type
  (Liam, HAL-12575).
- Only the limit's own error counts as `time-limit`; any other failure keeps `unknown` with no
  cause, so the log never guesses.
- When the connectors can't start, the cause is `connector-not-started` with `why: "other"` and
  no `name` for now. A later pull request fills in `why` and `name` from the typed start errors
  (HAL-12410); `name` will come only from the connector file's program or secret reference, at
  most 120 characters, never from an error message.

## Tests

No test was weakened or removed. The `tool.result` type test gains the optional field, marked as
added after the reference. Two `toEqual` checks in `connector-calls.test.ts` gain the cause the
result now carries. The new requirements have their own tests in `tool-failure-cause.test.ts`,
`connector-call-cause.test.ts` and `local-runs-tool-cause.test.ts`.

## Covers

- events.run-log-contract
