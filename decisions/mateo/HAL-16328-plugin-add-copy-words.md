# Decision: the already-added fixes of `plugin add` say "this copy"

- Approval: /HAL/issues/HAL-16328 (words check C695, rows 3–5, on HAL-16315). Team wording on approved flows under the HAL-2282 rule, so no board card.
- Kind: user-visible
- Task: HAL-16328

## What changes

- cli.commands.plugin.add: the fix under "<id> is already added." now says "To replace it with this copy and keep its settings, run the same command with --update." in place of "To put this version in its place and keep its settings, run the same command with --update." The example says so too.
- cli.commands.plugin.add-update: the fix when even a replace can't place the copy now says "To add this copy, remove it first: halonic plugin remove <id>" in place of "To add this version, remove it first: …".

The `--update` help line also changes, to "Replace the added plugin with this copy and keep its settings. If its files changed, it's off until you trust it again." No requirement quotes it.

## Why

An edited plugin folder usually keeps its version number, so "this version" read as if a new version were needed. "Copy" matches `plugin list`'s "copied from …". In the help line it's the plugin that is off, not its files, and the line now ends with a period like the other option lines.

## What doesn't change

Behaviour: the same refusals, exit codes and `--update` replace. Only the words change. The lines aren't released yet, so the changeset `plugin-add-update.md` (which doesn't quote them) stays as it is.

## Tests

No test was weakened or skipped. `add.test.ts` checks the new fix line in place of the old one.

## Covers

- cli.commands.plugin.add
- cli.commands.plugin.add-update
