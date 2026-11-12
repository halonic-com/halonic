# Decision: a subagent's end when the task agent finishes first, and a task sent while it works

- Approval: HAL-4131
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Y0TwzOEFGqsnBDBwpld9U505Soo1EY+XvEsV7IBM+ySRfo0MqeM4auDvc1pYwhlIgCedSlNkZzUi9G2Yatk3BQ==

Liam's review of PR #1203 (HAL-3636) asked for two changes to how the
Codex harness reports subagents. Both add to `harness-codex.subagents`:

- When the task agent finishes while subagents are still working, each of
  them now gets `agent.finished`, newest first, with an output that says
  the task agent finished first, just before the run's final
  `agent.finished`. Every `agent.started` then has its end, and a
  subagent's subagent finishes before the subagent that spawned it.
- A task sent with `sendInput` or `followupTask` while the subagent is
  still working goes into the turn it is on. It is no longer kept as the
  prompt of the subagent's next `agent.started`. A task sent after it
  finished still is.

The existing examples stay as they were; two are added, each with a test.

## Covers

- harness-codex.subagents
