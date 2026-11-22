# Decision: a plugin that stays off here is asked "Trust Weather?", also said without a terminal

- Approval: HAL-15752 (flow check C626 #1 on HAL-15750; wording on an approved screen, decided by the team under HAL-2282); Liam approves this note in review
- Kind: user-visible
- Task: HAL-15752

## What changes

`cli.commands.plugin.off-here`: while a plugin's backend would be off on this computer,
`halonic plugin add` and `halonic trust --plugin <id>` no longer ask "Trust Weather and turn it
on?" right under the line that says trusting it won't turn it on. The check's first line and the
question are "Trust Weather?". Without a terminal, the "! Trusting Weather won't turn it on: …"
line and its reason and fix lines now come after the check too, before "! Weather is added but
off, because there's no terminal to ask you to trust it." and the `trust --yes` command. The
requirement's sentence and example say this, and a new example covers the no-terminal output.

The tool rows under Tools for agents also line up past "Changes things", which is wider than a
row's first column. That is a layout fix the requirement doesn't word.

## Why

C626 found the CLI said a plugin won't turn on and then asked "Trust Weather and turn it on?",
and that a script without a terminal learned it stays off here only after it ran the suggested
`trust --yes`. Trust is still saved on yes and nothing a run may do changes.

## Tests

No test was weakened or skipped. `off-here.test.ts` now also checks the question's words and the
no-terminal lines; `plugin-trust-check.test.ts` checks the first line and the tool rows' column.

## Covers

- cli.commands.plugin.off-here
