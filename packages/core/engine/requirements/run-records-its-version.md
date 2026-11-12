# engine.run-records-its-version

- Status: active
- Since: 0.1.0
- Source: HAL-5173, step 6a of HAL-3246 (save model 2.2–2.3; `runs.run-view.live-or-saved` in req-runs)

When a run is started with a `version`, the engine shall record it on the run's `run.started` as it was given: the live version with its commit and that version's date, or the saved files. The local executor shall pass that `version` to its `definitionsOf`, so a host that can read more than one version starts the run with the definitions of the version it records. A child run that a `workflow` state starts shall record its parent's `version` on its own `run.started`, because it runs from the definitions its parent started with. A run started without a `version`, and a run whose log has none, shall record none and read as "not recorded".

## Examples

- Given a start of "reply" with `version: { reads: "live-version", commit: "4f2a…", versionDate: "2026-11-10T09:42:00+01:00" }`,
  when the executor starts it,
  then its `run.started` has that `version`.
- Given the same start,
  when the local executor reads the run's definitions,
  then it asks `definitionsOf` for the definitions of that `version`.
- Given a parent run of "onboard" started with `version: { reads: "saved-files" }` whose `workflow` state runs `reply`,
  when the child run starts,
  then the child's `run.started` has `version: { reads: "saved-files" }`.
- Given a start without `version`,
  when the executor starts it,
  then its `run.started` has no `version`, and the run's state has `version: null`.
