# ports.action-operation-route

- Status: active
- Since: unreleased
- Source: stream HAL-17488, the architecture note on HAL-17491 (row C1), Liam's plan OK on HAL-21110; task HAL-20275

The ports package shall let a route in the sender's route list name one of the sender's own operations instead of a method and a path, with the operation's body fields and the fields of its result the sender hands back. The ports package shall list each operation with the one service it belongs to, and a route whose service isn't the operation's service, or whose operation isn't on that list, shall not compile. An operation route shall carry no path.

## Examples

- Given the list of operations,
  when it is read,
  then it is exactly `paperclip.set-secret` for the `paperclip` service.
- Given an operation route for `paperclip.set-secret` with the `github` service, an unknown operation or a `path`,
  when it is compiled,
  then it doesn't compile.