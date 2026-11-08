# app.workspace-scope

- Status: active
- Since: 0.1.0
- Source: HAL-116 (feature state belongs to one open workspace)

The app shall give each open workspace its own command bus, event bus and service registry, shared with no other workspace. When a workspace scope is closed, it shall send `workspace.closing` once, dispose its services, drop every command handler and event listener, and refuse new commands and services. The scope's event bus shall report listener errors to the host instead of throwing them.

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
- Given a `workspace.closing` listener that throws,
  when the workspace is closed,
  then the error goes to the host's `onListenerError`, the services are still disposed, and the close succeeds.
