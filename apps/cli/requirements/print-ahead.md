# cli.print-ahead

- Status: active
- Since: 0.1.0
- Source: HAL-4056 (plan approved on HAL-4064: print ahead through pipes and CI too); cli-output 3.4 and 1.5, each ✓ line as its step finishes

When a command prints a result line ahead while it runs, the `halonic` command shall write that line to stdout straight away, above a live line on the screen, also through a pipe and in CI, and with `--json` shall write nothing then. When the command ends, the CLI shall print only the result lines after the ones printed ahead, so stdout holds the same lines as when nothing was printed ahead. When the lines printed ahead are not the first lines of the result, word for word, the CLI shall print every line of the result, and the CLI's tests shall fail.

## Examples

- Given a command that prints "✓ Classify it" and "✓ Draft a reply" ahead and returns those two lines and "Done.", through a pipe,
  when it runs,
  then stdout holds the two ✓ lines before the command ends, and "✓ Classify it", "✓ Draft a reply", "Done." when it has.
- Given the same command with `--json`,
  when it runs,
  then nothing is printed ahead and stdout is one JSON document.
- Given a command that prints "✓ Draft a reply" ahead and returns "✓ Classify it", "✓ Draft a reply", "Done.",
  when it ends,
  then all three lines are printed after the line printed ahead, and the mismatch is recorded.
- Given a terminal showing the live line "◌ Draft a reply",
  when a line is printed ahead,
  then the live line is erased, the line written, and "◌ Draft a reply" drawn again below it.
