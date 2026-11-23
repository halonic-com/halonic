# Decision: doctor reads plugin records only in a folder it checks

- Approval: the team's decision on HAL-16621 (from the real CLI runs in HAL-16606); the reviewer approves this note in review
- Kind: user-visible

`cli.doctor-plugins` said `halonic doctor` reads the plugin records "in any folder, with or without a workspace". That overpromised: `halonic doctor --dir <folder>` on a folder with no `workspace.yaml` stops with exit 4, as `cli.commands.doctor.check-this-computer` and the how-to's exit-code table already say. The requirement now says "in any folder it checks", and that a `--dir` with no workspace still exits 4, so outside a workspace you read the records with plain `halonic doctor`. The how-to says the same. No code changes.

## Why

Keeping the refusal means a mistyped `--dir` can't pass quietly as a check of the computer only. Only the wording of the plugin-records requirement was wrong.

## Covers

- cli.doctor-plugins
