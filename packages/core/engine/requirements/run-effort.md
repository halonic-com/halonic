# engine.run-effort

- Status: active
- Since: unreleased
- Source: HAL-17252 (token phase 1c, plan approved by Liam on the task)

When a run is started with `effort: "low"`, the engine shall record `effort: "low"` on its `run.started`, give it to the run's child runs, and give every harness agent of the run and its children `effort: "low"`, so the host sets the low effort on the agent's model calls in place of the agent file's and its alias's. When a run is started with `effort: "default"` or without an effort, the engine shall record no effort on its `run.started` and give its harness agents the `default` effort, so each keeps its own. A run read again from its log shall have the effort its `run.started` names, and `default` when it names none.

## Examples

- Given a run started with `effort: "low"`,
  when its harness agent's bridge opens,
  then its `run.started` has `effort: "low"` and the agent has `effort: "low"`.
- Given a run started with `effort: "default"`, or with no effort,
  when its harness agent's bridge opens,
  then its `run.started` has no effort and the agent has `effort: "default"`.
- Given a run started with `effort: "low"` whose state runs a child run,
  when the child starts,
  then the child's `run.started` has `effort: "low"`.
