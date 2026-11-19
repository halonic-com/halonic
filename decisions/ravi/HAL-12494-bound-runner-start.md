# Decision: a runner start has a time limit, so Take back never waits for ever

- Approval: Liam asked for this follow-up in his review of HAL-12344 (halonic#3568) and assigned HAL-12494; Liam signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8cHH/dV+wTc5XlqC7rMEPHkmLEMFYrvEdO1fM8NUl4LuM3l12VJmjYW/xJm353ce4yBfS77wpGyBRabp8cF7Dw==
- Task: HAL-12494

## What changes

- Requirement `app.runner-start-gate`: every start through the gate has a time limit,
  `runnerStartTimeoutMs` (30 s) unless the host sets its own. A start that doesn't settle in time
  fails closed with `RunnerStartTimeoutError`; a runner that arrives later is stopped at once and
  never registered. Before this, a start that never settled kept Take back waiting for ever, since
  Take back waits for every start without the sandbox in progress (HAL-12344).
- Requirement `app.unfenced-runs`: says that each start Take back waits for ends within the gate's
  time limit, and adds the example of a start that hangs.
- `RunnerStartGateOptions` gets a required `timers` and an optional `startTimeoutMs`. The task
  named the `Scheduler` port, as the engine's start limits use; the gate takes the app's
  `SaveTimers` instead, the timer port `UnfencedRuns` and `SaveScheduler` already take in
  `core/app`. The `Scheduler` port keeps timers by key outside memory and calls one listener the
  host binds at creation, which a wait of seconds inside one call doesn't need. Core still has no
  timers of its own.
- 30 s covers the sandbox opening and the runner's own 10 s for its ready message, and matches the
  engine's limit for a sandbox to open.

## Tests

No requirement was retired or weakened, and no test or golden file was skipped or deleted. Tests
are added to `runner-start-gate.test.ts`: a start that hangs fails after the limit, Take back
during a hanging start returns after the limit, a late runner is stopped, a host limit is used,
a bad one is refused, and a settled start leaves no timer waiting. Test callers in the CLI, the
agent host and `core/app` pass the new `timers`; their timer stand-in is renamed, and its comment
now says no start hangs there either.

## Covers

- app.unfenced-runs
- app.runner-start-gate
- packages/core/app/requirements/unfenced-runs.md
- packages/core/app/requirements/runner-start-gate.md
- packages/core/app/src/runner-start-gate.test.ts
