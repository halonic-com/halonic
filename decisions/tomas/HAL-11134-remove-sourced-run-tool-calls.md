# Decision: remove two tests of a field the Runs list no longer reads

- Task: HAL-11134
- Approval: HAL-11134 asks for this removal as the follow-up to HAL-11115 (reviewed on HAL-11133); Liam signs this note as the CTO
- Kind: internal

After PR 3187 nothing in Studio's Runs list reads `SourcedRun.madeToolCalls`, so the field is gone, and so is the per-run log read in `WorkspaceRuns` that filled it. The two tests that checked that read are removed with it, which is why the test count and the expect count of `studio.workspace-runs` go down. The requirement drops its sentence on that read and the tool call from its first example. `RunHistory.madeToolCalls` stays for the CLI. No other test was weakened or skipped.

## Covers

- studio.workspace-runs
- apps/studio/src/runs/workspace-runs.test.ts
