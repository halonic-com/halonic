# Decision: the CLI's harness host gets run copies and a trash in the profile

- Approval: scope decided on HAL-6477 and HAL-9301 (Liam); the package owner (Liam) approves this note in review
- Kind: internal

## What changes

`profile.workspace-folders` now also names `run-copies` and `trash` inside a workspace's profile
folder. `cli.local-harness-host` now says that a run in a workspace with no history writes in a plain
copy of the saved files there, where it used to say such a run doesn't start. Its test, "refuses a
run whose folder can't be opened, saying how to turn history on", is replaced by one that runs in the
copy and keeps the proposal, because the refusal no longer happens in the CLI. `halonic run` still
refuses harness agents (`refuseHarnessAgents`), so no person sees the change yet. No other example
was removed or weakened.

## Why

HAL-6477 turns harness agents on in `halonic run`, with history off as well as on. The host needs a
folder for the run's copy and one for the trash that Accept deletes into and Undo restores from,
and, as with the proposal folders (HAL-7747), a harness run must never write in the workspace itself.

## Covers

- profile.workspace-folders
- cli.local-harness-host
