# Decision: the harness of a whole run on `run.started`

- Requirements: `events.run-started-harness` (`packages/core/events/requirements/run-started-harness.md`),
  `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`)
- Task: HAL-189, step 6b (the engine side of `halonic run --harness`)
- Approval: Liam's decision on HAL-3789 asks for this field; the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gHITuPl09wLCZnA0PoXi+J8obaMAFYLK4ZYX5rRtl19P+KENUdmx7HSeCA+lSPQ+iM+jtN5jYkV+Oo4eUPVjBw==

## What changes

`run.started` gains an optional `harness`: the harness every task agent of the run runs in,
whatever its file names. `halonic run --harness codex` sets it. The plan first had the override as
a key in the run's `input`, but the input reaches every agent's prompt, so a key there would show
up in prompts and could clash with a workflow's own input field. A field of its own keeps the
input as the workflow's data, and the run still decides the same way when its log is read again.

`events.run-log-contract`: its third example listed "the fourteen fields that come with the
engine". It now lists fifteen, with `run.started.harness` and its requirement. No reference field
changes, and logs without `harness` read as before.

## Tests

No test was weakened. The `run.started` type test gains the optional field, marked as added after
the reference, and a new `events.run-started-harness` type test, in its own
`run-started-harness.test.ts`, checks an event with and without it.

## Covers

- events.run-log-contract
- events.run-started-harness
- packages/core/events/src/run-event.test.ts
