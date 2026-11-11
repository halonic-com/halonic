# app.run-records-its-version

- Status: active
- Since: 0.1.0
- Source: HAL-5173, step 6a of HAL-3246 (save model 2.2–2.3; `runs.run-view.live-or-saved` in req-runs; Liam's note on the plan: name the date for what it is)

When the app starts a run, it shall pass the executor the version of the workspace the run reads, so the run's `run.started` records it: for a run that reads the live version, its commit and that version's date, the date the version was made; for a run that reads the saved files, such as Try it, Test, or any run while history is off, the saved files. The routine scheduler shall ask for the version as each workflow run starts, from the live version it reads at that moment.

## Examples

- Given "briefing" live in a version made on 11 November at 10:42,
  when a run source picked for a Run is turned into the version to record,
  then it is `{ reads: "live-version", commit: <that version's commit>, versionDate: "2026-11-11T10:42:00Z" }`.
- Given the same workspace,
  when the run source picked for Try it is turned into the version to record,
  then it is `{ reads: "saved-files" }`.
- Given a start of "support-reply" with a version,
  when `WorkflowRuns` starts it,
  then the executor gets that version with the start.
- Given a routine that runs the "digest" workflow, in a workspace whose live version was made on 11 November at 10:42,
  when the scheduler starts it,
  then the start has that live version's commit and date; with history off, it has the saved files.
- Given a workspace with history but no version yet,
  when the routine list asks which version a routine run reads,
  then there is none, and no routine is scheduled.
