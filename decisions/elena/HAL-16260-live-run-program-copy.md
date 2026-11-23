# Decision: Studio starts a live run's connector programs in the agent host's copy, and reads its skills from its version

- Task: HAL-16260
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16260 (Liam approved the plan with changes, PR 2 as written; his review of PR 1 on HAL-16830 asked for the open and start race fix here)
- Kind: user-visible

## What changes

`studio.engine-service` said that, until the agent host could make a copy at a commit, a run's
connector programs start in the workspace folder, also for a run of the live version, and that a
harness agent's skills are read as saved. That sentence goes. A run of the live version now starts
its connectors' programs in the agent host's copy of the workspace at its commit
(`agent-host.program-copy-routes`, merged in PR 1, #5418), never in the workspace folder in its
place: a copy that can't be made fails the step. The engine releases the copy once the run's
connectors have closed, and when it opens it has the host stop the workspace's connectors and
sweep the copies an engine that stopped left. A harness agent's skills come from the version its
run records, and a chat turn's from the saved files. The connector sentence now says "in the
workspace folder for a run of the saved files and in the agent host's copy … for a run of the live
version". Four examples are added; none is removed.

`agent-host.connector-routes` gains one rule and one example: while the host starts a connector in
a held copy, a start or release of that workspace's copies waits, so a start closes that connector
before it removes the copy (Liam's [minor] on PR 1).

One test changes its expectation: in `apps/studio/src/connect/studio-run-connectors.test.ts`, the
live-version run's connector now starts in the copy (`workspaceRoot` is the copy's path), not in the
workspace folder, and the test now also checks that the copy is asked for at the run's commit and
released after the connector closes. No test was removed, skipped or weakened.

## Why

A program file that was saved with a change but not made live ran in Studio's window and not in
`halonic run`, and the trust check covers the version's connector files and commands, not the
program files on disk. The skills were the same gap for a harness agent's instructions: the agent's
file came from the run's version, its skills from the saved files. The window now does what the CLI
does (`engine.run-connectors`, `app.runs-read-latest-version`).

## Covers

- studio.engine-service
- agent-host.connector-routes
