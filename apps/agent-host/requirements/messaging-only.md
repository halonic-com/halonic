# agent-host.messaging-only

- Status: draft
- Since: unreleased
- Source: HAL-18311 (option A: messaging beside the shell on Windows, whatever runs the harnesses; security condition from Liam's decision)

When the agent host is started with `--messaging-only`, it shall serve `GET /v1/health` and the routes under `/v1/messaging/` and `/v1/paperclip/` only, and shall answer every other path with 404 `not_found`, as an unknown path, whatever the token: no run, harness, sandbox, bridge, connector, model, plugin, file, Google or remote route. It shall take no profile lock, sweep nothing and make no sandbox. Its workspaces are the `--sweep-root`s and the folders the shell names later (requirement `agent-host.opened-workspaces`). It shall check every request as the full host does: loopback `Host`, no `Origin`, and its own launch token.

## Examples

- Given a host started with `--messaging-only` and a workspace,
  when Studio asks `POST /v1/paperclip/connections` for it with the token,
  then it answers 200 with the workspace's connections.
- Given the same host,
  when a caller with the token asks to start a harness run, open a sandbox session or open a bridge,
  then each answers 404 `not_found` and nothing starts.
- Given the messaging's routes gain one under another path,
  when the host starts with `--messaging-only`,
  then that route isn't served.

## What it doesn't cover

Which host Studio's shell starts in this mode, and where its transport sends the two prefixes, is the shell's (HAL-18311, PR 1).
