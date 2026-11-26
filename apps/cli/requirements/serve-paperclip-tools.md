# cli.serve-paperclip-tools

- Status: active
- Since: unreleased
- Source: HAL-19721 (4.1b of the PR watcher under `halonic serve`, HAL-17974); `server.routines`, `server.paperclip-key-store`

When `halonic serve` serves a workspace, it shall connect that workspace's `paperclip` connectors (`format.connector-paperclip`) with the tools of `paperclip-client.task-tools`, so a workflow's tool steps, a routine's included, read the PR watcher's pass and wake or finish a task. Each call shall take the named connection's key from the serve profile's own secret store at that call, through the same key guard as the server's messaging: only when the connection file's address and company still match what the key was made for is the request sent, with the key. When no key is stored for the connection, the step shall send nothing and fail its run with `signed-out`. Its writes shall follow the connector's `tools.allow`, `tools.read` and `tools.approve` and the workspace's trust as every connector's do: a write the `read` list doesn't name waits for a person's approval, and an untrusted workspace's connector makes no write.

## Examples

- Given a trusted workspace whose routine's workflow reads `pr-watcher-pass`, decides in a rule step and calls `wake`, a stored key for the connection, and a fake Paperclip,
  when the routine falls due and a person approves the `wake`,
  then the fake receives exactly `GET /api/plugins/halonic.agent-tools/api/pr-watcher/pass?companyId=<company>`, then `GET /api/issues/<task>` and `PATCH /api/issues/<task>`, each with the stored key, and the run completes.
- Given the same workspace with no stored key,
  when the routine falls due,
  then the run fails at its first step with `signed-out`, and Paperclip receives nothing.
