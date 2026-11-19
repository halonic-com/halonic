# Decision: the run log says when a connector didn't start

- Approval: Liam approves this note in his review of this pull request on HAL-13829
- Kind: internal
- Task: HAL-13829

## What changes

`events.run-log-contract` lists every event added after the reference log. It gains
`connector.not-started` (new requirement `events.connector-not-started`): a connector of the
agent's file didn't start when a model turn listed its tools. It carries the agent, the connector's
id and a `cause` in the shape of a `tool.result`'s `connector-not-started` cause (`why` and the
program's or the secret's `name`), exported as `ConnectorNotStartedCause`.

The engine writes one for each connector whose listing failed, before the turn's first model call,
whether or not the model then calls its tools (new requirement
`engine.turn-logs-connector-not-started`). Readers that don't know the event skip it, as every
reader of the log does for a type it doesn't handle.

## Why

The C248 check (HAL-13818) found that a connector that can't start when a step begins leaves no
trace: the turn gets no tools from it, the step reads ✓ in `halonic run` and `halonic runs show`,
and nothing names the missing program or secret. That is the common case: a computer without the
program yet, or a secret not set yet. Studio's step panel (PR 3 of HAL-12471) and `runs show` need
the event to say it.

An event of its own, rather than a field on an existing one: no event fits. `connector.started`
is written by the effect path before a recorded call, not by a turn, and `tool.refused` only exists
when the model calls a tool it wasn't offered.

## Tests

No test was weakened or removed. `run-event.test.ts` lists the new type; the new
`connector-not-started.test.ts` checks its shape, and `local-runs-connector-not-started.test.ts`
checks that a run logs it (a missing program, a secret that isn't set, an unnamed error, and none
when the connector lists its tools). The first three fail without the change.

## Covers

- events.run-log-contract
- events.connector-not-started
- engine.turn-logs-connector-not-started
