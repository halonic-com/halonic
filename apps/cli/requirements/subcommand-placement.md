# cli.subcommand-placement

- Status: active
- Since: 0.1.0
- Source: HAL-2775 (Liam's review of halonic#810 on HAL-2798: a real subcommand after the command's options must not be called unknown); the words follow `cli.subcommands`; line 1 from cli-output revision 37 (HAL-2918, W10 of the HAL-2909 words check)

When a word after a command's options names one of the command's subcommands, the `halonic` command shall print "<subcommand> goes right after <command>, before any options." and, as its fix, the subcommand's usage line, and exit with 2, without running either command.

## Examples

- Given a `runs` command with a `--limit <n>` option and the subcommands `show` and `send`,
  when `halonic runs --limit 5 show 01JD8Q` runs,
  then it prints "✕ show goes right after runs, before any options." and, indented by two spaces, "Usage: halonic runs show <run-id>", and exits with 2.
- Given the same `runs` command,
  when `halonic runs --limit 5 deploy` runs,
  then it prints '✕ There\'s no command "runs deploy".' as `cli.subcommands` says, and exits with 2.
