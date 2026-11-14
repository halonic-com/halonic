# cli.secret-prompt

- Status: active
- Since: 0.1.0
- Source: HAL-195 (9a-2b); phase 4 plan on HAL-9 (`halonic secret` reads the value from a prompt or stdin, never an argument); the question rules of `cli.questions`

The `halonic` command shall let a command ask for a value without showing what is typed, such as a password. It shall ask only when stdin is a terminal that can hide the answer, `CI` isn't set and `--json` isn't given; otherwise it shall ask nothing and refuse with the command's own error. It shall write the prompt on stderr, followed by ": ", read one value, and end the line itself, because the Enter isn't shown. Backspace shall remove the last typed character, and arrow keys, other escape sequences and control characters shall be ignored. An empty line shall be an empty value, and the end of stdin before anything is typed shall be no value. What was typed after the Enter, such as a second value pasted with the first, shall answer the next prompt. The terminal shall go back to showing what is typed once the value is read, also when the prompt is stopped. Ctrl C or SIGTERM while it waits shall stop the command as for any other question: Ctrl C in raw mode sends the process its SIGINT, and the command gets the stop, never an empty answer. A value that was typed shall be scrubbed from everything the command prints afterwards.

## Examples

- Given a terminal,
  when a command asks "Password",
  then stderr gets "Password: " and, after the Enter, a newline, and nothing typed is written back.
- Given a terminal where the user types "ab", Backspace and "c",
  when the value is read,
  then it is "ac".
- Given a terminal where two values are pasted at once, one per line,
  when two prompts are asked in turn,
  then each gets its own value.
- Given `CI=true`, `--json`, stdin that isn't a terminal, or a terminal that can't hide the answer,
  when a command asks for a value,
  then it asks nothing and refuses with its error.
- Given a value that was typed,
  when the command then fails with an error that contains it,
  then the printed error doesn't show it.
- Given Ctrl C while the prompt waits,
  when the user presses it,
  then the terminal shows what is typed again and the command stops.
