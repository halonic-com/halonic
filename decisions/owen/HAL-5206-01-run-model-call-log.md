# Decision: a run's model calls write their turn to the run's log

- Requirements: `engine.run-turn-log` (new)
- Task: HAL-5206
- Approval: [HAL-5206](/HAL/issues/HAL-5206), the CTO's review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DOxBHIBnsvIygoiOcXl3C/KzDk1mQrC+GtUiqDYNPCww8iiBM0GC2nuMBVnyS03QbzEPYbtEF3Q8sRbiWUa7Dg==

## What changes

A run's own model call now writes its whole turn to the run's log: `llm.request` and
`llm.response` with usage and cost, `tool.called` and `tool.result`, and the turns of the
subagents it hands tasks to. Before, it wrote only `tool.refused`. The run's summary now counts the
tokens and cost of those calls.

The two `halonic run` golden files show the run's log and summary as JSON, so they now hold the
writer's `llm.request` and `llm.response`, the summary's `usage` has the tokens of those calls, and
`lastSeq` moves on by the events added. The human-readable output is unchanged.

## Why

A run's usage and cost should count every model call the run makes, as a chat turn's already do
(`engine.turn-logs-events`, `engine.turn-prices-calls`). The old CLI wrote the same events, so this
also closes the logging half of the parity gap HAL-4754.

## Tests

One test moved and one changed on purpose. `RunStoreTurnLog` moved from `src/agent/` to
`src/run/`, so its tests moved with it to `packages/core/engine/src/run/run-store-turn-log.test.ts`,
and `packages/core/engine/src/agent/run-store-turn-log.test.ts` is gone. Its test "stops the turn
when another writer moved the log on" checked behaviour this change replaces: the run's log now
moves on while a call runs (a person cancels the run, another branch writes), so the turn writes
after those events as long as the run still waits on the call, and stops once it doesn't. That is
`engine.run-turn-log`, tested there by "writes after another writer's event while the run still
waits on the call" and "stops the turn once the run no longer waits on the call". So
`engine.turn-logs-events` runs one test and two `expect` calls fewer (the old test's conflict
check and its `lastSeq` check, a getter the new log doesn't have), and nothing it promises lost a
test: its numbering and stamping test is unchanged apart from its setup.

The new behaviour has its own tests in
`packages/core/engine/src/run/local-runs-turn-log.test.ts` and
`packages/core/engine/src/run/run-store-turn-log.test.ts`. The parity test now checks that the
echo model's calls differ from the old CLI's only in the size of each call (the instructions
HAL-4754 still adds back), where it checked before that they differed only by these events.

`cli.commands.routines.watch` is listed under Covers because its `expect` count moves from run to
run: its tests wait with `vi.waitFor`, and every retry counts. This change touches no code in that
requirement; the guard only flags it because the golden files put this change in `apps/cli`.

`packages/core/engine/src/run/local-runs-durable.test.ts` (`engine.local-runs-durable`) changed
how it breaks a write, not what it checks. Its helper failed the store's next append, which was
the step that records a model call's answer. Now a call's turn writes `llm.request` first, so that
helper broke the turn's log before the model was called, and the run failed as any call does when
its log can't be written, the same as a harness call. The helper now fails the next append of a
step (the one that carries the run's snapshot), so the test still covers its example: the model
answered, its record failed once, and the next delivery records the kept answer without calling
again. Its tests and `expect` calls are the same.

## Covers

- engine.turn-logs-events
- cli.commands.routines.watch
- packages/core/engine/src/agent/run-store-turn-log.test.ts
- packages/core/engine/src/run/local-runs-durable.test.ts
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
