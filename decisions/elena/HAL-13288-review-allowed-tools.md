# Decision: `halonic tools review` asks only about the tools `allow` offers

- Approval: HAL-13288; Liam approves this note in review
- Kind: internal

## What changes

`cli.commands.tools.review` showed and asked about every tool a connector's server listed. It now
says that a tool the connector's `tools.allow` leaves out is neither shown, nor asked about, nor
counted as on, whether it waits, keeps changing, was refused or was approved. Without `allow`,
every listed tool counts, as before. Two new examples cover it, one of them the docs recipe
(`agent-with-a-tool`): only the allowed tool, approved, so nothing waits.

## Why

A tool outside `allow` is never offered to agents (`engine.run-connector-allow`), and
`halonic tools approve --all` already skips it (`cli.commands.tools.approve`). `review` asked the
person to approve 15 tools agents never get, which is noise and points the wrong way: the way to
switch such a tool on is to add it to `allow`, not to approve it (HAL-13288, found by C161). No
closing line about the hidden tools is added, the same as `approve --all`, so there are no new
words to agree. Naming a tool in `halonic tools approve` still approves it.

## Covers

- cli.commands.tools.review
