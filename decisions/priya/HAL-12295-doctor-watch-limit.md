# Decision: move the Windows drive doctor test into the new workspace test file

- Approval: HAL-12295
- Kind: internal

The doctor's Workspace tests now live in their own file,
`apps/cli/src/output/doctor-report.workspace.test.ts`, next to the new tests for the file-watch
limit. The `cli.doctor-windows-drive` test moves there unchanged, with its requirement tag, so
`doctor-report.test.ts` runs 23 tests instead of 24. No test is removed, weakened or skipped.

## Covers

- apps/cli/src/output/doctor-report.test.ts
