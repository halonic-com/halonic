# engine.run-harness-override

- Status: active
- Since: 0.1.0
- Source: HAL-189, step 6b (Liam's decision on HAL-3789)

When a run is started with a `harness`, the engine shall record it on the run's `run.started` and shall run every task agent of the run in that harness instead of the one the agent's file names: a `claude-code` or `codex` harness run for a program harness, or a model call for `halonic`. This holds for the agent a `foreach` state runs for each item, and for the agents of a `parallel` state's branches, which can't run a program harness yet: the run shall fail with an error that says the harness is the run's. An agent that isn't among the definitions the run started with shall still run in Halonic's own loop. A child run that a `workflow` state starts shall get the parent's harness and record it on its own `run.started`. The engine shall refuse a `harness` that isn't one of the harnesses an agent's file can name, with an error, before it records or keeps anything. A run's decisions shall read the harness from its log, so a replayed log decides as the live run did.

## Examples

- Given a `draft` task state whose `writer` agent names no harness,
  when the run starts with `harness: "codex"`,
  then `run.started` has `harness: "codex"` and the engine asks for a `codex` harness run as `call-1`.
- Given the same state whose `writer` agent names `claude-code`,
  when the run starts with `harness: "halonic"`,
  then the engine asks for a model call.
- Given a start with `harness: "claude"`,
  when the executor gets it,
  then it refuses it with a `RangeError` that lists the harnesses, and no run log or definitions are written.
- Given a parent run started with `harness: "halonic"` whose `workflow` state runs `reply`,
  when the child run starts,
  then the child's `run.started` has `harness: "halonic"` and its agent answers as a model call.
- Given a `parallel` state whose `searcher` branch agent names no harness,
  when the run starts with `harness: "codex"`,
  then the run fails with an error that says the branch's agent runs in the run's `"codex"` harness.
- Given the same state whose `searcher` agent names `claude-code`,
  when the run starts with `harness: "halonic"`,
  then the engine asks for a model call for every branch.
- Given a `triage` foreach state whose `writer` agent names no harness, with two items,
  when the run starts with `harness: "codex"`,
  then the engine asks for a `codex` harness run for each item, as `call-1` and `call-2`.
