# harness-bridge.sub-agent-spend

- Status: active
- Since: unreleased
- Source: HAL-17250 (token phase 1a, direction on HAL-16892, the board's yes on HAL-16897)

When a harness program's sub-agent makes a model call, such as one Claude Code's `Task` tool or Codex's `spawn_agent` starts, the call shall pass through the run's bridge with the run's token, as the program's own calls do, and the bridge shall record its `llm.request` and `llm.response`, with their usage, under the run and the run's agent. A sub-agent's tokens therefore count towards its parent run's usage and budget, and never towards a run of their own.

## Examples

- Given a program call and a sub-agent call made on one run's bridge, at the same time,
  when both replies have ended,
  then the run's recorder has an `llm.request` and an `llm.response` for each, all for the run's agent, with each call's own usage.
