# harness-host.sandboxed-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (the host only wires the policy in)

When the harness host opens the bridge of a Claude Code agent whose file, as the run kept it, says `asks: in-sandbox`, and the host was given a way to resolve paths, it shall put the ask policy's in-sandbox mode (`app.in-sandbox-approvals`) around the approvals its services give, read the fence and working folder from the session the engine hands the bridge (`engine.harness-bridge-session`), and write each call it lets through to the run log as `harness.allowed` with the agent, the tool, the path or command and the rule `asks-in-sandbox`. For any other agent, for an agent in another harness, and on a host with no way to resolve paths, the bridge shall get the services' approvals as they are. The CLI shall give its host the harness kit's path resolver (`harness-kit.real-path`). When the resolver throws or the run log can't take `harness.allowed`, the call shall go to the services' approvals and the host shall write why as a `bridge.failed` (kind `asks-path` or `asks-record`), or tell `reportError` when the run log can't take that either.

## Examples

- Given the writer with `asks: in-sandbox` and a fenced session,
  when Claude Code edits a file in its working folder,
  then the call is approved and the run log has `harness.allowed` for `Edit` and the path.
- Given the writer without `asks`, with `asks: always`, or in Codex,
  when it edits the same file, fenced,
  then the services' approvals are asked.
- Given the writer with `asks: in-sandbox`,
  when it edits before the session is handed over, or on a session whose fence is `off`, `not-fenced` or `stopped`, or on a host with no way to resolve paths,
  then the services' approvals are asked.
- Given the writer with `asks: in-sandbox` and a fenced session,
  when a path can't be resolved or the run log refuses `harness.allowed`,
  then the services' approvals are asked and the run log has a `bridge.failed` saying why.
