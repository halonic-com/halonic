# cli.run-view-failed-call

- Status: active
- Since: unreleased
- Source: HAL-15149 (C540 #3, item 4 on HAL-15081: a step whose tool call failed stayed ✓ and nothing said why, while Studio's step panel names the cause since #4426); plan approved by Liam on HAL-15150

When `halonic runs show` prints a run's steps (`cli.run-view`), it shall print under a step, for each of its tool calls whose `tool.result` has the outcome `error` or `unknown`, one dim line indented two spaces that says what Studio's step panel says under the same call (`runs.run-view.step-failed-call`), from the same words (`app.failed-call-line`), with the names from the log printed plain and made printable. The lines shall come in the order the calls were asked for, after the step's line and, with `--output`, before its output. A call that worked shall get no line, and the result's own text shall never be printed. The step's mark shall stay as `cli.run-view` and `cli.run-step-connector-mark` give it: a step that finished keeps its ✓, since the step finished and its agent may have got past the call. `--json` shall stay the run's events.

## Examples

- Given an Acme run whose step Read the email called `search_pages` from `notion`, which didn't answer within 60 seconds, then finished,
  when `halonic runs show 0a0b0c` is run,
  then "✓ Read the email Writer · default 1 s" is followed by "  Didn't work: the tool search_pages (notion) didn't answer within 60 seconds, so it may or may not have done its work.".
- Given a call that failed with an error and no cause,
  when its run is shown,
  then the line under its step says only "  Didn't work." and never the tool's text.
- Given a step with one call that worked and one whose connector didn't start because its program `acme-notes-mcp` is missing, without a connector named in the log,
  when its run is shown,
  then only the second gets a line: "  Didn't work: the connector of the tool create_note didn't start: its program acme-notes-mcp isn't on this computer.".
- Given a step whose call broke off without an answer and that wrote "Hi Sam,",
  when `halonic runs show 0a0b0c --output` is run,
  then the failed call's line comes before "  Hi Sam,".
