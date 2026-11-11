# engine.run-connector-read

- Status: active
- Since: 0.1.0
- Source: HAL-5583 (board decision on HAL-5522, option A, after HAL-5199 made every connector tool ask first)

When a run's model, or a subagent's model in a run, calls a connector's tool that the `read` list of that connector's file in the run's kept definitions names exactly, under the name its server lists it under, and that the file's `approve` list doesn't name and doesn't make `all`, the engine shall count the tool as `read`: it shall make the call without asking a person and without recording `effect.requested`, and shall record `tool.unasked` with the connector, the tool and `reason: "read-list"` before it makes the call (`events.tool-unasked`). A `parallel` branch, and a subagent under one, shall be offered such a tool. Nothing in the server's listing shall make a tool count as `read`: not its `risk`, not any other field, and not a tool's name that another connector's `read` list names. A tool the server lists as `send` shall stay `send`, whatever the file's `read` list says. Every other connector tool counts as `write` or `send`, as `engine.run-tool-calls` says.

## Examples

- Given a run whose agent lists `tracker`, and `tracker`'s file says `read: [search_issues]`,
  when the agent's model calls `search_issues`,
  then the call reaches `tracker` without a person's OK and without `effect.requested`, and the run log has `tool.unasked` for `tracker`'s `search_issues` with `reason: "read-list"`.
- Given the same run, where `tracker`'s server lists `create_issue` as `read`, with `readOnlyHint: true`, and the file's `read` list doesn't name it,
  when the agent's model calls `create_issue`,
  then the run waits for a person's OK, and the run log has no `tool.unasked`.
- Given a run where `mail`'s file says `read: [search_issues]` and `tracker`'s file has no `read` list,
  when the agent's model calls `tracker`'s `search_issues`,
  then the run waits for a person's OK.
- Given `tracker`'s file says `read: [search_issues]` and `approve: [search_issues]`,
  when the agent's model calls `search_issues`,
  then the run waits for a person's OK.
- Given `tracker`'s file says `read: [post_comment]` and its server lists `post_comment` as `send`,
  when the agent's model calls `post_comment`,
  then the run waits for a person's OK, as for any `send` tool.
- Given a run with a `parallel` state whose branches' agents list `tracker`, and `tracker`'s file says `read: [search_issues]`,
  when the branches' model calls are made,
  then each offers `search_issues` and no other `tracker` tool.
