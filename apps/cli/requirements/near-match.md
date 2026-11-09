# cli.near-match

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output 1.3, "Wrong usage", and section 4), approved by the board on HAL-2123

When a command or option on the command line doesn't exist, the `halonic` command shall say "Did you mean …?" only when exactly one command or option is within an edit distance of 2 of what was typed, counting a swap of two neighbouring characters as one edit. An option `--no-x` shall also be found by its stem `--x`. It shall never guess a file, workflow or other name the user may have typed on purpose.

## Examples

- Given `halonic tset` and a `test` command,
  when it runs,
  then it says 'There's no command "tset". Did you mean test?'.
- Given `--colour`,
  when it is read as an option,
  then it says "There's no option --colour. Did you mean --no-color?".
- Given a typo two edits from both `run` and `runs`,
  when it runs,
  then it offers neither.
