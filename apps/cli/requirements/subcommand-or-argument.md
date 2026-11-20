# cli.subcommand-or-argument

- Status: active
- Since: unreleased
- Source: HAL-6702 (`halonic deploy <deployment>` next to `halonic deploy status <deployment>`, from the multi-cloud ADR 5.6 and Sofia's approved deploy flow on HAL-6687)

When a command that lists subcommands also takes arguments of its own and the first word after it, or the first word after its options, names none of its subcommands, the `halonic` command shall run the command itself with that word as its first argument. A word that names one of its subcommands shall still run that subcommand right after the command, and after the command's options shall still print the line of `cli.subcommand-placement`.

## Examples

- Given a `deploy` command that takes `<deployment>` and has the subcommand `status`,
  when `halonic deploy web` runs,
  then `deploy` runs with the argument `web`.
- Given the same `deploy` command,
  when `halonic deploy --plan web` runs,
  then `deploy` runs with the argument `web` and `--plan`.
- Given the same `deploy` command,
  when `halonic deploy status web` runs,
  then `status` runs with the argument `web`.
- Given the same `deploy` command,
  when `halonic deploy --plan status web` runs,
  then it prints "✕ status goes right after deploy, before any options." and, indented by two spaces, "Usage: halonic deploy status <deployment>", and exits with 2.
- Given a `runs` command that has subcommands and takes no arguments of its own,
  when `halonic runs web` runs,
  then it prints '✕ There\'s no command "runs web".', as `cli.subcommands` says, and exits with 2.
