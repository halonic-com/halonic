# engine.harness-session-start

- Status: active
- Since: unreleased
- Source: HAL-17250 (token phase 1a, direction on HAL-16892, the board's yes on HAL-16897)

When the engine writes `harness.started` for a step, it shall say in `session` how the harness session began. Until Halonic resumes harness sessions, every session is `fresh`, for the reason `no-resume`, so the run log can count fresh starts by their cause.

## Examples

- Given a step that runs a harness,
  when the engine starts it,
  then its `harness.started` says `session: { start: "fresh", reason: "no-resume" }`.
