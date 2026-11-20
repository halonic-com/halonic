# cli.no-stray-arguments

- Status: active
- Since: unreleased
- Source: HAL-12639 (C54 docs check, item P19, decided by Liam; wording decided by the team on the task)

When a command that takes no arguments, only options, is given one, the `halonic` command shall exit with code 2 before the command runs, rather than run without it, with the line "halonic *command* takes no arguments, and you gave *arguments*." For one argument, the fix shall be the command's own, or else, for a command with `--dir`, to run it with `--dir` and that argument; for several, or a command with neither, it shall be the usage line. `halonic validate` shall point to `--dir` for a workspace and to `halonic plugin add` for a plugin folder.

## Examples

- Given a folder without a workspace,
  when `halonic validate ./lt` runs,
  then it exits with code 2, says "halonic validate takes no arguments, and you gave ./lt.", and suggests "halonic validate --dir ./lt" and "halonic plugin add ./lt"; it doesn't check the current folder.
- Given a folder without a workspace,
  when `halonic doctor ./lt` runs,
  then it suggests "halonic doctor --dir ./lt".
- Given two folders without a workspace,
  when `halonic validate ./lt ./acme` runs,
  then line 2 is validate's usage line.
- Given a command without `--dir`,
  when `halonic secret list openai-key` runs,
  then line 2 is the usage line of `secret list`.
