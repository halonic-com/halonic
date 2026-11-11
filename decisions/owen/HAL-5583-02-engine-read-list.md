# Decision: a connector file's `read` list lets a tool run without asking

- Approval: [HAL-5522](/HAL/issues/HAL-5522), the board's choice of option A; wording by Sofia on [HAL-5582](/HAL/issues/HAL-5582); Liam approves this note in review
- Kind: user-visible

Since HAL-5199 the engine counts every connector tool as `write` (or `send`),
whatever its server lists, so every connector call in a run waits for a
person's OK and a `parallel` branch gets no connector tools. The board chose
to let the workspace mark safe tools by name, in the connector file:

```yaml
tools:
  # Tools listed here run without asking. Only list tools that don't change anything.
  read:
    - search_issues
```

What changes:

- `engine.run-connector-read` (new): a tool the file's `read` list names
  exactly, and `approve` doesn't, counts as `read`. Its calls run without a
  person's OK and without `effect.requested`, and a `parallel` branch, or a
  subagent under one, is offered it. Nothing in the server's listing can
  add a tool to the list. A tool the server lists as `send` stays `send`.
- The run log gets `tool.unasked` (`events.tool-unasked`, added in part 1)
  before such a call, so the run record says why no one was asked. `read_run` shows it as Sofia worded
  it: "Ran without asking: `search_issues` is in your workspace's `read` list."
- `engine.run-tool-calls`, `engine.run-connector-calls`,
  `engine.parallel-state`, `engine.subagent-connector-reads`: name the
  `read` list as the one way a connector tool counts as reading.
- `test-runner.scripted-tools`: a `halonic test` case needs no `approve`
  event for a tool the connector file lists under `read`.

No test was skipped or loosened. The `read_run` test gained one line for the
new event.

## Covers

- engine.parallel-state
- engine.run-connector-calls
- engine.run-tool-calls
- engine.subagent-connector-reads
- test-runner.scripted-tools
