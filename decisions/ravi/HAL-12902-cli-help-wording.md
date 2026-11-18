# Decision: five CLI --help lines and the missing-key message get tidier wording

- Task: HAL-12902 (rows HELP A to E of the C96 CLI reference check on HAL-12897)
- Approval: Liam placed HAL-12902, decided the HELP C wording and reviews this change on it (a team decision with no board card, HAL-2282 rule: wording fixes on text the board already approved). He signs this note.
- Kind: user-visible

## What changes

Wording only; no command behaves differently.

- Requirement `cli.commands.google.allow-sending`: the usage line it quotes gains
  `[--dir <folder>]`, which the command already accepts. `google sign-in`'s usage line gains it
  too.
- Requirement `cli.commands.models.allow-address`: the message for a key that isn't saved becomes
  `There's no key named "missing-key". Save it with halonic secret set missing-key or on the
  Models page first.` The suggested command is quoted with `shellWord`, as other suggested
  commands are.
- Requirement `cli.help`: `plugin remove`'s summary becomes `Remove a plugin and its settings`,
  imperative like every other summary. The tip "To only turn it off: halonic trust --plugin <id>
  --remove" is dropped, because one summary feeds both `plugin --help` and `plugin remove --help`;
  the docs page (HAL-12900) can carry it. `tools --help` prints `Usage: halonic tools`, like the
  other command groups. Four option descriptions end with a full stop.

## Tests

No requirement was retired or weakened, and no test or golden file was skipped or deleted. The
tests of `cli.help` make 2 fewer `expect` calls because the test that keeps every `--help` line
within 80 columns checks one line per call: the shorter `plugin remove` summary no longer wraps,
so `plugin --help` and `plugin remove --help` are each one line shorter. The tests of
`cli.commands.models.allow-address` and `plugin`'s sentences expect the new wording.

## Covers

- cli.commands.google.allow-sending
- cli.commands.models.allow-address
- cli.help
