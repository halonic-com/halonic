# Decision: `halonic tools approve --all` approves only the tools the connector's `tools.allow` offers

- Approval: Liam assigned HAL-11886 and left the choice to Ravi; Liam signs this note
- Kind: user-visible
- Signature: (Liam signs on review)
- Task: HAL-11886

## What changes

- Requirement `cli.commands.tools.approve`: `--all` approves the waiting tools that `tools.allow`
  offers (all of them when there is no `allow`). A tool `allow` leaves out is never offered to
  agents, so approving it told the person they had approved tools that can't run. Naming such a
  tool still approves it. One example is added; the two sentences about `--all` say "offers".
- No new wording: the output is the existing lines, with fewer tools.

## Tests

No requirement was retired or weakened and no test or golden file was skipped, changed or deleted.
One test is added in `approve.test.ts`.

## Covers

- cli.commands.tools.approve
- apps/cli/src/commands/tools/requirements/approve.md
