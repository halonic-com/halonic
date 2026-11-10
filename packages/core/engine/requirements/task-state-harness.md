# engine.task-state-harness

- Status: active
- Since: 0.1.0
- Source: HAL-189, stack 4a of its implementation plan (Liam's review on HAL-1967)

When a run enters a plain `task` state whose agent's file names a harness other than Halonic's own loop (`claude-code` or `codex`), the engine shall record `agent.started` as for any task and ask for one harness run of that harness under a new call id, instead of a model call. When that run's result comes back, the engine shall finish the state as it does on a model's answer. When the agent's file names `halonic`, names no harness, or isn't among the definitions the run started with, the engine shall ask for a model call as before.

## Examples

- Given a `draft` task state whose agent `writer` has `harness: claude-code`,
  when the run starts with `from: support`,
  then the engine records `agent.started` with `Reply to support` and asks for a `claude-code` harness run as `call-1`;
  and when `call-1` gives `On its way`, it records `agent.finished`, sets `reply` and moves to `sent`.
- Given the same state whose agent has no `harness`,
  when the run starts,
  then the engine asks for a model call, as before.
