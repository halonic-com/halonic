# agent-host.messaging-engine

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, section 7 (S8); S8a plan on HAL-18501, approved by Liam (25 Nov) with his conditions (atomic 0600 file without a token, key from the profile's `workspaceFolders`, S3's address rule); HAL-18742; HAL-19698 (S8c); security review pending (Julian, then Liam)

The agent host shall keep each workspace's messaging engine, "This computer" or "Server", in the profile at `workspaces/<key>/messaging-engine.json`, where `<key>` is the workspace's key from the profile's `workspaceFolders` and never anything read from the workspace's own files. No file shall mean "This computer". The file shall hold `{ "version": 1, "engine": "server", "address": "<origin>" }`, with the `computerName` and `sessionEndsAt` pairing gave when it has them, and never a token; a `computerName` that isn't a name the server takes or a `sessionEndsAt` that isn't a date shall be left out, never trusted; the host shall write it as a temporary file with mode 0600 renamed over the setting, and shall refuse to save an address that isn't `https` or plain `http` to this computer.

When a workspace's engine is "Server" and the keychain holds its device token (`server-pairing__<key>`, `agent-host.keychain-secrets`), the host's messaging hub for that workspace shall join one server client (`server.messaging-client`) in place of every local Paperclip provider, behind the same offline cache and the same routes. When the token is missing or the keychain can't be read, the hub shall join nothing for that workspace. While the engine is "Server", the host shall refuse Connect (the key hand-over and the Paperclip sign-in) and Disconnect of a local Paperclip connection with 409 `server_engine`, keeping no key and calling no Paperclip. When the engine is "This computer" again, the hub shall join the Paperclip providers it kept. While the engine is "Server", the host shall keep no Paperclip events socket open for that workspace (`agent-host.paperclip-live-events`), and shall open a new one for each kept connection when it is "This computer" again; a socket that fails to close or open shall be logged and shall not stop the switch.

If the setting's file can't be read, isn't JSON, has another version or a field the host doesn't know, or has an address that breaks the rule, then the host shall read the engine as "This computer" and say so once, without the file's contents, and shall not fail.

## Examples

- Given a workspace connected to Paperclip,
  when its setting changes to "Server" with a device token in the keychain and the hub switches,
  then Studio's same routes list only the server's sources, through the same cache, and every request to the server carries the token in its `Authorization` header only.
- Given a workspace whose engine is "Server",
  when a `git pull` rewrites `connections/paperclip/halonic.yaml` and adds a `messaging-engine.json` to the workspace,
  then the engine and its address are as they were.
- Given a setting file written by a newer Halonic (`"version": 2`),
  when the workspace opens,
  then its engine is "This computer" and the host logs one warning.
- Given a workspace whose engine is "Server",
  when Studio hands over a Paperclip key or disconnects a Paperclip connection,
  then the host answers 409 `server_engine` and keeps no key.
