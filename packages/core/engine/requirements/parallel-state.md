# engine.parallel-state

- Status: active
- Since: 0.1.0
- Source: HAL-1536, step 5(b) of the HAL-186 plan; "Parallel" in docs/specs/workflow-semantics.md

When a run enters a `parallel` state, the engine shall record `agent.started` with `branch` for every branch, in name order, and ask for every branch's model call at once, each with the branch's `input` rendered against the scope. When a branch's call answers, the engine shall record `agent.finished` with `branch` and the answer. When a branch's call fails, or its agent stops for an approval, the engine shall record `agent.finished` with `branch`, `output: null`, the `error` and its `reason`, and the run shall go on. Once every branch has ended, the engine shall write each result to the context under its branch name, in name order (`{ error }` for a failed branch), write them all as one map to `output` when the state names one, and take the `done` transition. With `join: all` (the default) and without `continueOnError`, a failed branch shall instead fail the run once every branch has ended, with the first failed branch in name order and its reason. With `join: any`, the run shall fail only when every branch failed. When the state has no branches, or a branch's agent runs in a program harness, the engine shall fail the run with an error that says so. Name order shall hold in every run, because runs keep their definitions as canonical JSON, which keeps no file order.

## Examples

- Given a `research` state with branches `web` (agent `searcher`) and `notes` (agent `reader`) and `output: findings`,
  when the run enters it,
  then the engine records two `agent.started` events, `branch: "notes"` then `branch: "web"`, and asks for `call-1` (notes) and `call-2` (web).
- Given that run,
  when `call-2` answers `"w"` and then `call-1` answers `"n"`,
  then the engine records both `agent.finished` events, sets `notes` to `"n"`, `web` to `"w"` and `findings` to `{ notes: "n", web: "w" }`, and moves on `done`.
- Given that run with `continueOnError: true`,
  when `call-2` fails with `model-unreachable` and `call-1` answers `"n"`,
  then `web` is `{ error }` and the run moves on `done`.
- Given that run with the default join,
  when `call-2` fails with `model-unreachable`,
  then the run waits for `call-1`, and fails with `reason: "model-unreachable"` once `call-1` has answered.
- Given that run with `join: any`,
  when both calls fail,
  then the run fails once the second has failed.
