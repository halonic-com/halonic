# cli.print-error

- Status: active
- Since: 0.1.0
- Source: HAL-1994, decided on HAL-1984; `--debug` from HAL-2147; secret scrubbing from HAL-2224; the error shape F16 (HAL-1712 failure-states, section 5) and the CLI output draft on HAL-1981 (section 1.3)

When a command fails, the `halonic` command shall print the error to stderr in one shape: "✕" and the error's message on the first line, then the error's own `fix` on the next line, indented by two spaces. An error without a `fix` shall get no fix line, and the CLI shall never make one up. For a wrong command line the fix shall be its own `fix` when it has one, such as the pointer to `halonic --help` for an unknown command, and otherwise the command's usage line. An error without a kind shall never show its own text: the CLI shall print that Halonic ran into a problem it can't explain yet, and to run it again with `--debug` and report it. When the command line has `--debug`, anywhere before a `--`, the CLI shall also print, after those lines and for an error of any kind, the error's own stack (or its text when it has none) and each error in its `cause` chain after "Caused by:". In every line it prints, the CLI shall replace each secret value a command loaded through the CLI's `Secrets`, raw or URL-, form- or JSON-encoded, with "[secret removed]", also when the secret holds a line break.

## Examples

- Given an `unavailable` error "Halonic couldn't reach Ollama at localhost:11434." with the fix "Start Ollama, then run again.",
  when it is printed,
  then the lines are "✕ Halonic couldn't reach Ollama at localhost:11434." and, indented by two spaces, "Start Ollama, then run again.".
- Given a `not_found` error with no fix, or a fix that is only spaces,
  when it is printed,
  then only the ✕ line is printed.
- Given the usage error "halonic schema takes at most one folder, and you gave two: a, b." from `halonic schema`,
  when it is printed,
  then the lines are "✕ halonic schema takes at most one folder, and you gave two: a, b." and, indented by two spaces, "Usage: halonic schema [outDir]".
- Given a plain `Error` whose message holds a file path, the thrown string "boom", or an `internal` error,
  when it is printed,
  then the lines are "✕ Halonic ran into a problem it can't explain yet." and, indented by two spaces, "Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues", and none of the error's own text.
- Given the same plain `Error` and `--debug` before or after the command,
  when it is printed,
  then the same two lines are followed by the error's stack, which starts with its own text.
- Given an `unavailable` error with a fix that wraps a disk error as its `cause`, and `--debug`,
  when it is printed,
  then the ✕ line and the fix line are followed by the error's stack, then "Caused by:" and the disk error's stack.
- Given a command that loaded the secret "made-up-key-" with a line break and "second-line-42" after it, and an `unavailable` error whose message, URL-encoded fix and stack quote it, and `--debug`,
  when it is printed,
  then each copy is "[secret removed]" and no part of the secret is printed.
