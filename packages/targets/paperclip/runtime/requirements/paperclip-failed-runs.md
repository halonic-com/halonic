# runtime.paperclip-failed-runs

- Status: active
- Since: unreleased
- Source: HAL-18162, step 1b of the phase 3 plan on HAL-17450 (rev 5, "Generic actions, company settings"), Liam's decision (b) on HAL-18139: `failed_runs` moves from `tooling/paperclip` into the runtime, which keeps its own record of `agent.run.failed` events

When a plugin's built-in snapshot has a tool that runs `paperclip.failed-runs`, the runtime shall subscribe to Paperclip's `agent.run.failed` event and keep each failed run once in plugin state, as its run, agent, task, a cause code (`no_identity`, `spend_limit`, `timeout`, `adapter_error`, `other`) and a time, never the error text, for at most a week and at most the newest 500 runs, with the time of the first run it kept; when a tool runs `paperclip.failed-runs`, the runtime shall answer the kept runs since the agent's `since`, or the tool's `hours` back when it gives none, per agent with their counts by cause and their tasks' identifiers, in the same text as `failed_runs`, saying since when it has been counting and that runs which failed while the plugin was down are missing; it shall refuse a `since` that isn't a time before it reads anything; and the action shall ask Paperclip only for `events.subscribe` and `issues.read`, the record being the runtime's own bookkeeping.

## Examples

- Given an `agent.run.failed` event for Mateo's run on ACME-7 with "No managed GitHub identity" in its error,
  when an agent then calls `failed_runs`,
  then it answers "- Mateo: 1 (no_identity 1) on ACME-7", and the error text isn't in plugin state.
- Given 501 failed runs in the last week and one older,
  when the runtime keeps them,
  then the record holds the newest 500.
- Given `since: "yesterday"`,
  when the agent calls `failed_runs`,
  then it answers "since must be an ISO time, such as 2026-11-22T12:00:00Z." and reads nothing.
- Given a built-in snapshot with no tool that runs `paperclip.failed-runs`,
  when the worker starts,
  then it doesn't subscribe to `agent.run.failed`.
