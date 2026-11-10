# cli.subcommands

- Status: active
- Since: 0.1.0
- Source: HAL-2775 (Liam's decision on HAL-2772: one shared subcommand field, for `runs` and `plugin`); the words follow the approved CLI output on HAL-1981 (sections 1.3 and 1.9), with the command's words added

When a command lists subcommands and the word right after it names one, the `halonic` command shall run that subcommand with the arguments after it, and its usage line shall name both words, such as "Usage: halonic runs show <run-id>". `halonic <command> --help` shall list the command's subcommands under "Commands:" with their summaries, before its options, and end with "Run halonic <command> <command> --help for a command's arguments and options." with the command's word in the first place. A word after the command that isn't one of its subcommands shall print "There's no command" with both words and, as its fix, "Run halonic <command> --help to see its commands.", and exit with 2; when exactly one subcommand is within an edit distance of 2 of the word, the first line adds "Did you mean" with both words. A command that only hands off to its subcommands shall, given no subcommand, print its help and exit with 2.

## Examples

- Given a `runs` command with the subcommands `show` and `send`,
  when `halonic runs show 01JD8Q` runs,
  then `show` runs with the argument `01JD8Q`.
- Given the same `runs` command,
  when `halonic runs --help` runs,
  then it lists `show` and `send` with their summaries under "Commands:" and ends with "Run halonic runs <command> --help for a command's arguments and options.", and exits with 0.
- Given the same `runs` command,
  when `halonic runs shwo` runs,
  then it prints '✕ There\'s no command "runs shwo". Did you mean runs show?' and, indented by two spaces, "Run halonic runs --help to see its commands.", and exits with 2.
- Given a `plugin` command that only has subcommands,
  when `halonic plugin` runs,
  then it prints its help, with its subcommands, and exits with 2.
