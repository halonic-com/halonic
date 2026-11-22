# Decision: a plugin's trust --remove says when there was no trust, and --list names plugins

- Approval: HAL-15398 (Iris's flow check C570 on HAL-15386, item 5, assigned to Ravi to fix)
- Kind: user-visible
- Task: HAL-15398

`halonic trust --plugin <id> --remove` said "Removed trust" also when the plugin had no trust, and
`trust --remove` in a plugin's folder whose trust was gone named the folder's path as if it were a
workspace. `trust --list` showed a plugin as its folder path. The requirements below now say what
each one does instead. Nothing a run may do changes: the same trust is forgotten and the same
grants are signed out as before.

## Covers

- cli.commands.trust.plugin
- cli.commands.trust.review-and-trust

## What changes

- `cli.commands.trust.plugin`: `--plugin <id> --remove` for a plugin that wasn't trusted says
  "✓ Weather isn't trusted on this computer, so there was no trust to remove." in place of the
  confirmation, still followed by the sign-out lines, and `--json` gives the status `not-trusted`.
  `trust --remove` in the plugin's folder says the same, also once the plugin's trust is gone.
- `cli.commands.trust.review-and-trust`: `--list` names a plugin by its manifest's name and
  "(plugin)", and its `--json` adds the `kind`.
