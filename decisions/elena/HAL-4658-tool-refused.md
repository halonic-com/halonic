# Decision: a call to a tool the model wasn't offered is recorded as `tool.refused`

- Approval: [HAL-4658](/HAL/issues/HAL-4658), decided by the CTO on [HAL-4657](/HAL/issues/HAL-4657); the package owner approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/hJIMD65e5J2nVRuDmJUVb4Pe5ri/ZDbS18bZvFkXwwG0YGv+d9ICvD1e88WsnUHLAgf3OP4EcQ/nQAioGATCw==
- Task: HAL-4658

## What changes

The run log gets a `tool.refused` event (new requirement `events.tool-refused`): the agent, the
tool's name exactly as the model wrote it, the model's id for the call in `toolCallId`, and the
reason, for now only `not-offered`. `events.run-log-contract` lists it among the events added since
the reference. No reference event or field changes.

`engine.turn-logs-events` said a refused call writes no `tool.called`. It still writes no
`tool.called` or `tool.result`, and a call to a tool the turn didn't offer now writes one
`tool.refused` instead. A new example covers it.

`engine.run-connector-allow` said a call to a tool that wasn't offered reaches no connector. It now
also says the call asks no person, records no effect and writes one `tool.refused` to the run log.

## Why

The model only sees the tools it was offered, so a call to any other name is either a hallucination
or a sign of a prompt injection trying to reach a tool it wasn't given. Julian's attack tests on
HAL-4629 showed such a call left no trace in the run log, and an audit of a run should show it.

The name is stored as the model wrote it, not normalised: a look-alike or control character in it is
exactly what an audit needs to see.

The field is `toolCallId`, not `callId`: in `effect.requested` and `approval.requested`, `callId` is
the engine's own `call-<n>`, and this is the model's id for its call, as `toolCallId` in a chat's
tool message.

Only `not-offered` is recorded. A call the run's check refuses, a person rejects, or that may not send
is a call to a tool the model was offered, and the decision about it is recorded elsewhere or not at
all, as before. `reason` is a closed list so later reasons need their own change.

## How runs write it

A run's model turn had no run log at all yet: its own `llm.*` and `tool.called` events wait for step
4 of the HAL-186 plan. So in a run, the engine now gives the turn a log that writes only
`tool.refused`, through the same `SerialRunLog` that harness calls already write their events with,
while the run waits on the call. The event is written where the refusal is made, in the call's
`foreach` item or `parallel` branch (`SerialRunLog` gained the branch label for this). The turn's
other events stay unlogged in a run, as before, until step 4 gives it its full log.

How Studio shows the event is out of scope; if it should show in the run view, that is a UX question
for the board.

## Tests

No test was weakened. In `local-runs-connector-allow.test.ts`, the check that a refused call logged
nothing now also expects exactly one `tool.refused` with the call id and the name as given, and
keeps the no-connector and refusal-text checks. The turn test of a refused call now expects the
`tool.refused` between the model calls.

## Covers

- events.tool-refused
- events.run-log-contract
- engine.turn-logs-events
- engine.run-connector-allow
- packages/core/events/src/run-event.test.ts
- packages/core/engine/src/agent/run-model-turn.test.ts
- packages/core/engine/src/run/local-runs-connector-allow.test.ts
