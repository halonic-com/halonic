# agent-host.sandboxed-asks

- Status: active
- Since: unreleased
- Source: HAL-15287, part of HAL-14992 (Owen's plan approved with changes by Liam: the harness host only wires the policy in)

When Studio opens a bridge on the agent host with the agent's `asks` and harness (`agent-host-client.bridge-allowed`), the host shall give the bridge the approvals `sandboxedAsks` of `@halonicjs/host-harness-host` builds (`harness-host.sandboxed-asks`) around Studio's approvals, with the harness kit's path resolver (`harness-kit.real-path`), whether the computer is Windows, Studio's recorder, which carries each `harness.allowed` to Studio as a `recorder.record` call, and the bridge's own failure report, which scrubs the keys Studio handed it. When a harness run starts on that bridge, the host shall give the bridge the host's own sandbox session the run starts in, so only the fence the host's sandbox proved lets a call through, never one Studio names. The first session a run starts the bridge in binds it: when a run starts on a bridge already bound to another session, the host shall answer `409 bridge_in_use` before the harness starts, so the fence the first run's calls are judged by never changes. A run in the same session may start on it again. The bridge binds before the harness starts, so a start that fails still binds it. A bridge opened without `asks`, or without a harness, shall ask Studio for every call, as before.

## Examples

- Given a bridge opened for the writer with `asks: in-sandbox` and `harness: claude-code`, and a run started on it in a fenced session,
  when Claude Code edits a file in the session's working folder,
  then the call is approved without asking Studio's approvals, and Studio gets a `recorder.record` call with `harness.allowed` for `Edit` and the path.
- Given the same bridge,
  when Claude Code edits a file before any run started on it, or in a run whose session isn't fenced,
  then Studio's approvals are asked.
- Given a bridge opened without `asks`, or with `asks: in-sandbox` and no harness,
  when Claude Code edits a file in the working folder of a fenced session,
  then Studio's approvals are asked.
- Given a bridge a run started in a session that isn't fenced,
  when a second run starts on that bridge in a fenced session,
  then the host answers `409 bridge_in_use`, and Claude Code's edits in the first run still ask Studio's approvals.
- Given a bridge a run started in a fenced session,
  when a second run starts on it in the same session,
  then the run starts.
