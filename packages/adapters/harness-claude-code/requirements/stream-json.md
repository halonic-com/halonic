# harness-claude-code.stream-json

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C2; HAL-3219; harness state H7 on HAL-2350

The Claude Code harness shall turn the lines of `claude --output-format stream-json` into run events. A subagent call shall become `agent.started` and its result `agent.finished`, both with the calling agent as `parent`, and each subagent shall get a name of its own. Any other tool call shall become `tool.called` and `tool.result`, with the subagent as `agent` when a subagent made it, except a call through the bridge, which the bridge records itself. The `result` line shall become the one final `agent.finished` of the task agent, and nothing shall follow it. An error result shall end the run with an error instead, and a sign-in message in it with a `SignInError`. Line types it doesn't know shall be skipped. A line that isn't JSON shall end the run with an error that doesn't quote the line, and no error shall contain the bridge token.

## Examples

- Given Claude Code calls `Agent` with `subagent_type` "Explore" and the subagent calls `Read`,
  when the lines are read,
  then the events are `agent.started` for "Explore" with parent "writer", `tool.called` and `tool.result` for `Read` by "Explore", then `agent.finished` for "Explore".
- Given two subagents of the same type,
  when they start,
  then the second one is named with "-2".
- Given a call to `mcp__halonic__send_email`,
  when its lines are read,
  then there is no event for it.
- Given a `result` line with `"subtype": "success"` and the text "Done.",
  when it is read,
  then the event is `agent.finished` for "writer" with output "Done.", and later lines give no event.
- Given a `result` line whose text is "Login expired · Please run /login",
  when it is read,
  then the run ends with a `SignInError` for `sign-in-expired`.
- Given a line that isn't JSON and holds the bridge token,
  when it is read,
  then the run ends with an error whose message doesn't contain the token.
