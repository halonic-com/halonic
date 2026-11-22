# cli.outside-text-escaped

- Status: active
- Since: unreleased
- Source: HAL-16336 (cli-output section 5, "Outside text is escaped")

When the `halonic` command draws a line for a terminal or a pipe, it shall write each control character (C0, DEL and C1) and each bidi control in the line's text as its visible `\u` code, wherever the text came from: a workspace's names, an engine's or a server's message, or a sentence of Halonic's own. Only the colours and styles Halonic itself adds shall reach the stream as escape sequences. With `--json`, the document shall keep such text as it was written (`cli.json`).

## Examples

- Given a workspace named `acme` with an escape that clears the screen before it, when `halonic doctor` prints its Workspace line, then the line shows `\u001b[2J` before `acme` instead of clearing the screen.
- Given a harness agent whose name holds a line break, when `halonic doctor` prints the Harnesses line, then the name stays on one line, with `\u000a` where the break was.
- Given a workflow whose name holds an escape, when `halonic runs send` says the run goes on, then the name shows the escape's `\u` code.
- Given an engine message that holds a cursor move, when a run's failure line quotes it, then the line shows the move's `\u` code.
- Given a bold name with an escape in it, when the line is drawn in colour, then the name is bold and its escape shows as its `\u` code.
