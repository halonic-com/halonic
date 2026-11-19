# engine.harness-may-start

- Status: active
- Since: unreleased
- Source: HAL-12811 (Julian's follow-up from his security review of HAL-12799, decided on HAL-12810)

When the host gives the local executor a `mayStartHarness` check, the executor shall ask it right before each harness step of a run starts, after everything else the step needs is ready. On a no, or when the check rejects, the step shall start nothing (no sandbox, no harness, no bridge) and the run shall fail with a `denied` error whose cause is `engine.untrusted-workspace`, naming the agent and its harness, in the shape the model resolver refuses a model call in a workspace that isn't trusted. Without the check, every harness step shall start as before.

## Examples

- Given a run whose agent runs in `claude-code`, and a check that says no,
  when the run's harness step is due,
  then no harness starts and the run fails with `Agent "writer" runs in claude-code, and this workspace isn't trusted on this computer, so Halonic didn't start it.`
- Given the same run, and a check that rejects,
  when the harness step is due,
  then the same happens.
- Given the same run, and no check,
  when the harness step is due,
  then the harness starts and the run completes.
