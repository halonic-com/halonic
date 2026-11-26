# format.connector-paperclip

- Status: active
- Since: unreleased
- Source: HAL-19721 (4.1b of the PR watcher under `halonic serve`, HAL-17974)

A connector file shall be able to name the built-in Paperclip task tools with `transport: { paperclip: { connection: <name> } }`, where `<name>` is the name of one of the workspace's Paperclip connection files (`connections/paperclip/<name>.yaml`): a letter or digit, then up to 63 letters, digits, `_` or `-`. The transport shall take no other field, so the file never holds a key: the key is the one the connection's owner stored on the computer that runs it. Without `local: true`, a Paperclip connector shall not count as local.

## Examples

- Given `transport: { paperclip: { connection: halonic } }`,
  when the file is parsed,
  then it reads, and the connector isn't local.
- Given `connection: ../keys`, or a `key` beside the connection,
  when the file is parsed,
  then it has a problem.
