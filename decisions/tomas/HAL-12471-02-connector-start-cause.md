# Decision: a call whose connector didn't start names the program or the secret

- Approval: Liam approved the plan on HAL-12575 (PR 2 of it); he approves this note in his review of this pull request on HAL-12471
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9IZqhl9KszGtUr2csS/sh8ifvP7EC4XouWvoYEySZjgGviSllYU1bZ8d3hgC8hEeaHHgHebxlusoYtj8lp6xBA==
- Task: HAL-12471

## What changes

`engine.tool-result-cause` said a call whose run's connectors couldn't start gets
`connector-not-started` with `why: "other"` and no `name`. Now, when the error is one of the typed
start errors (HAL-12410), the cause says `program-missing` or `secret-not-set`, with the program or
the secret's name in `name`, cut to 120 characters. A call whose connector couldn't list its tools
gets the same cause, where it got `not-made` / `tool-gone` before: in a run the program starts on
the first listing, so that is where a missing program or secret shows. Any other start or listing
error keeps `why: "other"` with no `name`. The text the model hears doesn't change.

The engine reads the error with a new reader in `@halonicjs/ports`, `connectorStartFailureOf`
(new requirement `ports.connector-start-failure`). It goes by the error's `name` and field, as
`isConnectorToolError` does, so core imports no adapter.

## Why

So Studio's step panel can say which program or secret was missing (HAL-12429, microcopy 1.6),
instead of "the tool is gone" for a connector that never started.

- `name` comes only from the error's `program` or `secretName` field, which the adapter fills from
  the connector file's `command` or secret reference, never from the error's message, which can
  hold paths or a program's output.
- A listing failure is `connector-not-started`, not `tool-gone`: the tool didn't go anywhere, its
  connector didn't answer.

## Tests

No test was weakened or removed. `connector-call-cause.test.ts` gains four cases (a missing
program, a missing secret from the listing, a listing error it can't name, a long name). The
reader has its own tests in `ports`, and `adapter-mcp` checks that its two errors pass it.

## Covers

- engine.tool-result-cause
