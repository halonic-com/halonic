# cli.print-error

- Status: active
- Since: 0.1.0
- Source: HAL-1994, decided on HAL-1984; the error shape F16 (HAL-1712 failure-states, section 5) and the CLI output draft on HAL-1981 (section 1.3)

When a command fails, the `halonic` command shall print the error to stderr in one shape: "✕" and the error's message on the first line, then the error's own `fix` on the next line, indented by two spaces. An error without a `fix` shall get no fix line, and the CLI shall never make one up. For a wrong command line the fix shall be the command's usage line. An error without a kind shall never show its own text: the CLI shall print that Halonic ran into a problem it can't explain yet, and where to report it.

## Examples

- Given an `unavailable` error "Halonic couldn't reach Ollama at localhost:11434." with the fix "Start Ollama, then run again.",
  when it is printed,
  then the lines are "✕ Halonic couldn't reach Ollama at localhost:11434." and, indented by two spaces, "Start Ollama, then run again.".
- Given a `not_found` error with no fix, or a fix that is only spaces,
  when it is printed,
  then only the ✕ line is printed.
- Given the usage error "Give at most one folder." from `halonic schema`,
  when it is printed,
  then the lines are "✕ Give at most one folder." and, indented by two spaces, "Usage: halonic schema [outDir]".
- Given a plain `Error` whose message holds a file path, the thrown string "boom", or an `internal` error,
  when it is printed,
  then the lines are "✕ Halonic ran into a problem it can't explain yet." and, indented by two spaces, "Report it: https://github.com/halonic-com/halonic/issues", and none of the error's own text.
