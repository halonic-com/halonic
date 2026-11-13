# Decision: `halonic tools approve` words all three `--all` endings and names the tools approved before a `--json` failure

- Approval: Liam asked for both fixes on HAL-8297, the two [minor] findings of his review of #2344
  (HAL-8290); Liam signs this note
- Kind: internal
- Signature: unsigned, for Liam's key
- Task: HAL-8297

## What changes

- Requirement `cli.commands.tools.approve` says that `--all` ends on one of three lines, not only
  "Tools that change later ask again.": the nothing-waiting line and "Approved no tools from
  <source>: the ones waiting keep changing." The code and goldens already do this. One example
  is added for the second ending.
- The requirement also says that, with `--json`, an error that stops `approve` at a named tool
  gives the tools approved before it as `approved`. The code now does, so a script can tell that
  `archive` stayed approved when `approve notes-mcp archive lokup lookup` stops at `lokup`.
  Another example covers it.

## Tests

No requirement was retired or weakened and no test was skipped or deleted; every sentence of the
requirement stays true. The `--json` golden of `approve-changed`, `approve-not-listed` and
`approve-refused` gains `"approved": []` in the error, because the field is always present when a
named approval fails. Their colour and `NO_COLOR` goldens are unchanged. One golden file is added,
`approve-several-stops.txt`, with a test in `approve.test.ts`.

## Covers

- apps/cli/src/commands/tools/requirements/approve.md
- apps/cli/src/commands/tools/golden/approve-changed.txt
- apps/cli/src/commands/tools/golden/approve-not-listed.txt
- apps/cli/src/commands/tools/golden/approve-refused.txt
