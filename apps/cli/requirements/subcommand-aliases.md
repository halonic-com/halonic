# cli.subcommand-aliases

- Status: active
- Since: unreleased
- Source: HAL-16071 (the team's decision on HAL-16069: `halonic proposals discard` becomes `reject`, and `discard` keeps working); the words follow `cli.subcommands`; HAL-16157 (C682 3: the subcommand's own help names the old word, as the README does)

When a subcommand was renamed and keeps its old word, the `halonic` command shall run the subcommand for the old word as for its name, with the arguments after it. The old word shall not be listed in the help, suggested by "Did you mean" or shown in a usage line: those shall name the subcommand by its name. Only the subcommand's own help shall say, after its summary, that the old word still works.

## Examples

- Given a `proposals` command whose `reject` subcommand keeps the old word `discard`,
  when `halonic proposals discard 01JD8Q` runs,
  then `reject` runs with the argument `01JD8Q`.
- Given the same `proposals` command,
  when `halonic proposals --help` runs,
  then it lists `reject` and not `discard`.
- Given the same `proposals` command,
  when `halonic proposals reject --help` runs,
  then after its summary it says "discard, its old name, still works."
- Given the same `proposals` command and a `reject` that needs a run id,
  when `halonic proposals discard` runs,
  then its usage line reads "Usage: halonic proposals reject <run-id>", and it exits with 2.
