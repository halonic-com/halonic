# agent-host-client.bridge-allowed

- Status: active
- Since: unreleased
- Source: HAL-15287, part of HAL-14992 (Owen's plan approved with changes by Liam)

When the stand-in bridge host opens an agent's bridge and the agent's file, as the call reads it, names `asks`, it shall send the agent host that `asks` and the agent's harness with the bridge's run and agent, and send neither when the file names no `asks`. When the host calls `recorder.record` with a `harness.allowed`, it shall record it only with exactly its fields (`agent`, `tool`, `detail` and the rule `asks-in-sandbox`), answering an error for any other shape, and shall write the bridge's token in its `detail` as `[run token]` and remove every key value its `scrub` removes, as for a `bridge.failed` (`agent-host-client.bridge-failures`).

## Examples

- Given the writer, a Claude Code agent whose file says `asks: in-sandbox`,
  when its bridge opens,
  then the host's open body has `asks: in-sandbox` and `harness: claude-code`.
- Given an agent whose file names no `asks`,
  when its bridge opens,
  then the host's open body has neither.
- Given an open bridge whose token is `run-token`,
  when the host calls `recorder.record` with a `harness.allowed` for `Bash` whose command holds `run-token`,
  then the engine's recorder gets it with `[run token]` in its place and the host gets `null`.
- Given a `harness.allowed` with another rule, or with a `cost`,
  when the host calls `recorder.record` with it,
  then the host gets an error answer and nothing is recorded.
