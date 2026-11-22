# Decision: `plugin add --update` replaces an edited plugin, and `plugin list` says a folder plugin is a copy

- Approval: /HAL/issues/HAL-14325 (Nina's words check C340, row C45, on HAL-14271; parked by Liam on HAL-14295 until after 0.1.0). The team decides it under the HAL-2282 rule: it gives the CLI the update Studio's approved plugin page already has a place for ("Update from folder"), in that page's terms.
- Kind: user-visible
- Task: HAL-14325

## What changes

- cli.commands.plugin.add: a plugin that is already added is still refused (exit 5), but the fix now says "To put this version in its place and keep its settings, run the same command with --update." in place of "To add another version, remove it first: halonic plugin remove <id>". The example says so too.
- cli.commands.plugin.list: a folder source is shown as "copied from <path> on <day>", the day it was added or last updated, in place of the bare path. A git source stays as it is, since its commit already names the copy. `--json` adds `addedAt`. One example is added.
- cli.commands.plugin.add-update is new: `--update` replaces an added plugin with the same id through `PluginService.add` with `replace`, keeping its settings and secrets, and asks for trust again when the files changed.

## Why

C45: a plugin author edits the folder they added and retries all the time. `plugin list` showed that folder as the source, so the edit looked live, but Halonic runs its own copy. Adding again was refused with "remove it first", and `remove` deletes the plugin's settings and API key. Core already replaces a plugin in place (`replace`), so the CLI only had to offer it. The old fix pointed to the one path that loses data.

## What doesn't change

`plugin add` without `--update` still refuses a plugin that is already added and writes nothing. Trust is never carried over to changed files: the fingerprint changes, so the plugin is off until a person trusts it again. `plugin remove`, the trust check and Studio are unchanged.

## Tests

No test was weakened or skipped. `add.test.ts` checks the new fix line in place of the old one. `list.test.ts` checks the "copied from … on 11 Nov" cells and `addedAt` in `--json`. `add-update.test.ts` is new: an edited copy on yes, No and no terminal, an unchanged copy, a plugin not added yet, and a broken copy that leaves the added one as it was.

## Covers

- cli.commands.plugin.add
- cli.commands.plugin.list
- cli.commands.plugin.add-update
