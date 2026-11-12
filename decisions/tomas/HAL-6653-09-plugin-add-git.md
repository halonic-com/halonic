# Decision: plugin lines name the git address again

- Approval: Liam decided this on HAL-6426: its note says HAL-1736 puts cli-output 3.6's wording back when git sources are built, a team decision with no board card; the package owner (Liam) approves this note in review on HAL-6841
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gLu0hHs+uWpfF8kWfstteq1cNmZumPb1rVVL013ZL3jFbT4tX1mNTrz4338lCcvWDeMruh3teAKraHzAj7ckDA==
- Task: HAL-6841

## What changes

`cli.commands.plugin.list`: with no plugins it says "No plugins yet. Add one with halonic plugin
add <folder or git address>." again, instead of naming only a folder. The example keeps its shape,
only the sentence changes.

`plugin add`'s refusal fix goes back to "Check the folder or git address." too, as
`cli.commands.plugin.add-git` says; its requirement doesn't quote the fix, so only its tests change.
No example was removed or weakened.

## Why

This pull request builds `halonic plugin add <git address>[@commit]`, so the lines users see can
offer it. `plugin remove` still isn't built, so "Add or list plugins" and "See it with halonic
plugin list." from HAL-6426 stay as they are.

## Covers

- cli.commands.plugin.list
