# connector-stdio-sandbox.blocked-events

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5): a blocked access becomes a `sandbox.blocked` event

The sandboxed stdio connector shall hand each access its session's sandbox refused to the factory's `onBlocked`, with the connector's id, from when it is created until it is closed, so the host can turn it into the run's `sandbox.blocked` event.

## Examples

- Given a connector created in a session,
  when the sandbox blocks a network access and then the connector is closed and the sandbox blocks a file read,
  then `onBlocked` heard the network access once, with the connector's id, and not the file read.
