# Decision: the Studio answers runs through its own engine

- Task: HAL-13318 (continues HAL-8792, item 3)
- Approval: Liam, in review of HAL-13318
- Kind: user-visible

## What changes

`studio.workspace-runs` said that, until the window had an engine of its own,
answering a run fails as `unavailable` with the CLI line to copy. The window has
that engine now (`studio.engine-service`), so an answer from the Inbox (Approve,
Reject, Ask for changes or a wait step's own event) goes to it, with the tool
call or wait step it answers, and the runs are read again so the Inbox and the
Runs list show the run moved on. The `unavailable` answer with the CLI line
stays for a `WorkspaceRuns` built without an engine.

The test that checked the `unavailable` answer keeps checking it, for the case
without an engine, under a new name; a new test checks the answer through the
engine, including that a late answer for another call is refused.

## Why

The board decided on HAL-11786 that Studio 0.1.0 waits for Approve and Reject to
work in the Studio window. Without this, the sample's step 2 can't be done in
Studio (HAL-11782).

## Covers

- studio.workspace-runs
- apps/studio/src/runs/workspace-runs.test.ts
