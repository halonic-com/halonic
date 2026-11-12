# Decision: golden output for `halonic tools revoke`

- Approval: Liam approved the command and its output in his review of halonic#2182 on [HAL-7396](/HAL/issues/HAL-7396), a team decision with no board card; the package owner (Liam) approves this note in that review
- Kind: internal

`halonic tools revoke` adds three golden files that pin its text output: removing approvals
(`revoke.txt`), a tool that isn't approved (`revoke-not-approved.txt`) and an unknown source
(`unknown-source.txt`). The wording and exit codes (0 removed, 4 not found, 2 usage) are the
ones Liam reviewed in halonic#2182 and match section 2 of the CLI exit-code table.

## Covers

- apps/cli/src/commands/tools/golden/revoke.txt
- apps/cli/src/commands/tools/golden/revoke-not-approved.txt
- apps/cli/src/commands/tools/golden/unknown-source.txt
