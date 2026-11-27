# agent-host.paperclip-connection-file-changed

- Status: active
- Since: unreleased
- Source: HAL-20467 (Julian's security sign-off of #6768 on HAL-20413); `agent-host.paperclip-key`, `agent-host.paperclip-connection`

When the agent host lists a workspace's connections and holds a key for a connection whose file's address (scheme, host and port) or company no longer matches the ones the key was made for, the agent host shall list that connection as `signed-out` with the file's current address and company, without sending any request.

## Examples

- Given `halonic` connected with a key made for `https://paperclip.acme.test`,
  when its file's address changes to `https://paperclip.other.example` and Studio lists the connections,
  then the row shows `https://paperclip.other.example` as signed out and no request goes to either address.
- Given the same connection,
  when only its file's company changes,
  then the row lists as signed out and no request goes to Paperclip.
- Given the same connection with its file unchanged,
  when Studio lists the connections,
  then the row lists as online.
