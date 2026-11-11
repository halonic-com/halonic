# integration-runner.declaration

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958 section 5, the loader: a local integration's code loads only in the runner)

When the runner has received `start`, it shall send `declared` with the integration's name, version and tools, with only the fields the protocol knows. Halonic's side of the bridge shall wait for it within the time for `ready`, hand it over as frozen data on the connection, and treat any other frame before it, a second one, or one whose tools don't fit the protocol's shape as outside the protocol: report it as blocked and stop and kill the runner.

## Examples

- Given a runner that has `start` and an integration whose tool has a field of its own,
  when the runner declares,
  then `declared` carries the tool's name, description, parameters, risk and `untrusted`, and nothing else.
- Given a runner that has `start`,
  when it sends a `pong` before `declared`,
  then the connection fails with the reason `protocol` and the runner is killed.
- Given a runner that has `start`,
  when it declares a tool with the risk `delete`,
  then the connection fails with the reason `protocol`.
- Given a runner that never declares,
  when the time for `ready` is over,
  then the connection fails with the reason `unresponsive` and the runner is killed.
