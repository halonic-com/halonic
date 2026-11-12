# Decision: plugin lines name plugin remove again

- Approval: Liam asked for this on HAL-6888, from his review of this pull
  request on HAL-6837; it puts back cli-output 3.6's wording for `plugin remove`, approved on
  HAL-2123, and the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:htfl0SuNC4cgU8Cw9vB9F4Jetg4eogpMaQsgqomuSa2/JInA/5VqPl/IZxjhDcDTcdhRFF/3M3AaXi3DMcWCDg==
- Task: HAL-6888

## What changes

`cli.commands.plugin.add`: the example for a plugin that is already added names its fix again as
"To add another version, remove it first: halonic plugin remove weather", which replaces "See it
with halonic plugin list." from HAL-6426. The refusal itself (conflict, nothing written, exit 5)
is unchanged. No example was removed or weakened.

`halonic plugin --help` says "Add, list or remove plugins" again instead of "Add or list plugins".

`cli.commands.plugin.list` doesn't change.

## Why

HAL-6426 took `plugin remove` out of the lines users see because the command wasn't built yet.
This pull request builds it, so the lines that point to it are true again. The lines about where a
plugin comes from keep main's wording for a folder or a git address (HAL-1736).

## Covers

- cli.commands.plugin.add
