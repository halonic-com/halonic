# engine.parallel-state

- Status: active
- Since: 0.1.0
- Source: HAL-1536, step 5(b) of the HAL-186 plan; "Parallel" in docs/specs/workflow-semantics.md

When a run enters a `parallel` state, the engine shall record `agent.started` with `branch` for every branch, in name order, and ask for every branch's model call at once, each with the branch's `input` rendered against the scope. When a branch's call answers, the engine shall record `agent.finished` with `branch` and the answer. When a branch's call fails, or its agent stops for an approval or before a connector call that can change things, the engine shall record `agent.finished` with `branch`, `output: null`, the `error` and its `reason`, and the run shall go on. Where the executor is given connector calls, a branch's model call shall offer only the connector tools whose listing says they read, so the agent never sees a tool it can't use there. Once every branch has ended, the engine shall write each result to the context under its branch name, in name order (`{ error }` for a failed branch), write them all as one map to `output` when the state names one, and take the `done` transition. With `join: all` (the default) and without `continueOnError`, a failed branch shall instead fail the run once every branch has ended, with the first failed branch in name order and its reason. With `join: any`, the run shall fail only when every branch failed. When the state has no branches, or a branch's agent runs in a program harness, the engine shall fail the run with an error that says so. Name order shall hold in every run, whatever the branches' order in the file, because runs keep their definitions as canonical JSON, which keeps no file order. The results shall not depend on the order in which branches end. The old runner used the file's order; this is an allowed parity difference (`parallel-branch-name-order`).

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
- Given that run,
  when `call-1`'s agent stops before a call to `send-mail` that can change things,
  then the engine records `agent.finished` for `notes` with `output: null` and `reason: "error"`, records no `effect.requested`, and the run waits for `call-2`.
- Given that run, with connector calls, and a connector `mail` that lists `search` (`read`), `archive` (`write`), `send_mail` (`send`) and `label` (no risk),
  when the engine asks for each branch's model call,
  then each call offers `search` and none of the other three.
