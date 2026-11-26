# services.server-engine

- Status: draft
- Since: unreleased
- Source: HAL-18747 (S8b of the S8 plan on HAL-18501); `agent-host-client.server-engine`

Where an agent host serves the workspace, the Studio window shall provide the server engine to its features through `ServerEngineService`, asking the host's server engine routes for the open workspace and passing on their answers as they came, so no answer holds the device token. When the host refuses the engine's state with 409 `keychain_needed`, the service shall answer the `keychain-needed` engine instead of failing; every other refusal shall reject as it came.

## Examples

- Given a host started without a keychain,
  when Settings reads the workspace's engine,
  then the answer is `{ engine: "keychain-needed" }`.
- Given a host that refuses with 404 `unknown_workspace`,
  when Settings reads the workspace's engine,
  then the call fails with that kind.
