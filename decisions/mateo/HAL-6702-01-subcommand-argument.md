# Decision: a command with subcommands may take an argument of its own

- Approval: Paperclip task HAL-6702 (step 1d of the HAL-198 build plan); the command shape is ADR 5.6 on HAL-35 and Sofia's deploy flow on HAL-6687, approved by the board on HAL-6814. Liam reviews the pull request on HAL-6702 and signs this note
- Kind: internal

`halonic deploy <deployment>` deploys, and `halonic deploy status <deployment>`,
`rollback`, `export`, `import`, `destroy` and the rest are its subcommands (ADR
5.6). Until now a command with subcommands took no arguments of its own, so
`halonic deploy web` would print "There's no command "deploy web"".

A command can now opt in with `argumentsBesideSubcommands: true`. Then a first
word that names none of its subcommands is the command's own argument. A
subcommand's name always wins, and a subcommand after the options still gets the
`cli.subcommand-placement` line. The new requirement is
`cli.subcommand-or-argument`.

`cli.subcommands` gains one clause: its "There's no command" line is for a command
that takes no arguments of its own. No existing command opts in, so nothing a user
sees changes in this pull request, and no test of `cli.subcommands` changes.

## Covers

- cli.subcommands
