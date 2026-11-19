# Decision: move the Windows drive doctor test into the new workspace test file

- Approval: HAL-12295
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1BcQqQH5eUUODfKZ0avT4xLi/TBEcJnEU176EO03j29eEhq9f13/U45iWT0hxnaW7FLWl0jXMs77lVZ2s3tjAQ==

The doctor's Workspace tests now live in their own file,
`apps/cli/src/output/doctor-report.workspace.test.ts`, next to the new tests for the file-watch
limit. The `cli.doctor-windows-drive` test moves there unchanged, with its requirement tag, so
`doctor-report.test.ts` runs 23 tests instead of 24. No test is removed, weakened or skipped.

## Covers

- apps/cli/src/output/doctor-report.test.ts
