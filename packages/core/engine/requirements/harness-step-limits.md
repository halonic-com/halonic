# engine.harness-step-limits

- Status: active
- Since: unreleased
- Source: HAL-12481, Liam's plan on the task (Halonic Code first slice, HAL-12473; gap found by HAL-11950); builds on `format.agent-harness-limits` and `engine.budget-stops`

While a harness step runs, the engine shall keep it to its agent's `harnessLimits`, and a limit the file leaves out shall not apply:

- `maxSteps`: the engine shall count each model call the bridge passes on. It shall refuse the call that would go past `maxSteps`, before its `llm.request` is logged, with a `limit_reached` error the bridge answers with 429.
- `maxCost`: the engine shall add up the `cost` of each `llm.response` the bridge records. A response without a cost, or one a subscription paid, adds 0. Once the total reaches `maxCost`, the step shall stop, and the bridge shall refuse every later model call.
- `maxMinutes`: the engine shall count the step's running time from the start of the harness, on one timer through the `Scheduler` port. The timer shall not count while the run waits for a person's answer, and shall go on from where it stopped once the answer comes. When the time is up, the step shall stop.

A step that reaches a limit shall stop as a budget stop does: the harness run, the session and the bridge stop, in that order. The step shall then fail with the error `Agent "<agent>" used all <n> of its steps (harnessLimits.maxSteps), so Halonic stopped <harness>.`, `Agent "<agent>" spent <spent> of its <limit> (harnessLimits.maxCost), so Halonic stopped <harness>.` or `Agent "<agent>" ran for its <n> minutes (harnessLimits.maxMinutes), so Halonic stopped <harness>.`, with the reason `error` and the cause `{ kind: "limit_reached", code, detail: { limit, used } }`, where `code` is `harness.max-steps`, `harness.max-cost` or `harness.max-minutes`. The agent's own `maxSteps` shall not bound a harness step.

## Examples

- Given a `coder` agent in Claude Code with `harnessLimits: { maxSteps: 2 }`,
  when its program makes a third model call,
  then the bridge refuses it, the log has two `llm.request` events, the harness run, the session and the bridge stop, and the step fails with `Agent "coder" used all 2 of its steps (harnessLimits.maxSteps), so Halonic stopped Claude Code.` and the cause `harness.max-steps`.
- Given `harnessLimits: { maxCost: 1 }` and two model calls that cost 0.60 and 0.50,
  when the second answer is in,
  then the step stops with `Agent "coder" spent 1.10 of its 1.00 (harnessLimits.maxCost), so Halonic stopped Claude Code.`, and a third model call is refused.
- Given `harnessLimits: { maxMinutes: 10 }` and a program that keeps working,
  when the step's timer arrives,
  then the step stops with the cause `harness.max-minutes`.
- Given `harnessLimits: { maxMinutes: 10 }`, a step that ran 4 minutes and then waited an hour for a person's answer,
  when the answer comes,
  then the timer is set again for 6 minutes from then.
- Given an agent without `harnessLimits`, whose `maxSteps` is 6,
  when its program makes ten model calls,
  then none is refused.
