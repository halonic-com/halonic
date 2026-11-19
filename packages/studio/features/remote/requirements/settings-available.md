# remote.settings-available

- Status: active
- Since: unreleased
- Source: HAL-12241; tunnel phase B build plan, decisions 13 and 19 (HAL-12232); ports.remote-control

Studio shall show Settings › Remote only while the host's `RemoteControl` reports `available`. Without a `RemoteControl` service, the section shall never show. When the host stops offering remote, the section shall leave again.

## Examples

- Given no `RemoteControl` service,
  when the window asks whether Remote is available,
  then it never hears `true`.
- Given a host that doesn't offer remote,
  when the window asks,
  then it hears `false`, and `true` once the host offers it.
