# app.workspace-scope

- Status: active
- Since: 0.1.0
- Source: HAL-116; plan 4.2 and U1 (feature state belongs to one open workspace)

Each open workspace shall have its own command bus, event bus and service registry, shared with no other workspace. When a workspace scope is closed, it shall send `workspace.closing` once, dispose its services, and drop every command handler and event listener.

## Examples

- Given two open workspaces,
  when a command is registered in the first,
  then the second has no handler for it.
- Given an open workspace with a disposable service and a command,
  when it is closed,
  then `workspace.closing` is sent with its location, the service is disposed, and the command rejects with a `CommandError`.
- Given a closed workspace,
  when it is closed again,
  then nothing is sent or disposed a second time.
