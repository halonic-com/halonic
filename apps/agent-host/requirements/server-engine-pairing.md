# agent-host.server-engine-pairing

- Status: draft
- Since: unreleased
- Source: HAL-19918 (the computer's name, the paired name and the server's reach, plan approved by Liam on HAL-19920); HAL-17512 `server-engine` rev 2, section 7 (S8); S8a plan on HAL-18501 (S8a-3), approved by Liam (25 Nov) with his conditions (canary on the error paths, no unredacted error text, switch back never leaves "Server"); Sofia's flow on HAL-18622; HAL-18744; security review pending (Julian, then Liam)

The agent host shall serve `POST /v1/messaging/server-engine/state`, `/pair`, `/pair-status`, `/pair-cancel` and `/use-this-computer`, and the shell's route table (`studio.src-tauri.agent-host-commands`, `agent-host-client.shell-routes`) shall let a page call these five. Each shall refuse a request from another site with 403 `secret_from_other_site` before reading its body, shall answer 409 `keychain_needed` when the host has no keychain (no `--keychain-relay`), and shall answer 404 `unknown_workspace` for a folder the launcher didn't name. No answer of these routes, and no line the host logs, shall hold the device token, the server's pending ID or the text of a keychain's, the platform's or the server's error.

When Studio asks for a workspace's engine, the host shall answer it with the computer's name, without control or format characters and cut to 80 characters, when one is left. For a server, it shall add the name the computer paired as, kept in the setting next to the address, and whether its last call to that server got through: `offline` with the time for a failed request (the network, a timeout, an abort) or a 5xx, `online` with the time for a 2xx, unchanged by any other answer, and none before the first call since the host joined that pairing. The computer's name shall go nowhere but this answer and the pairing it's used for.

When Studio starts a pairing with a server's address, a pairing code and this computer's name, the host shall refuse an address that isn't `https`, nor plain `http` to this computer, as `address_not_allowed`, shall check `GET /api/hello` and answer `not_halonic` or `unreachable` when it doesn't answer as a Halonic server, and shall then ask `POST /api/pair`, keep the server's pending ID in memory under a pairing ID of its own, and answer `waiting` with that ID, the check code and `expiresAt`; a 401 shall be `code_refused` and a 429 `too_many`, with the minutes of its `Retry-After` when given.

When Studio asks where a pairing stands, the host shall ask the server once and answer `waiting` with `expiresAt`, `expired`, `refused`, `cancelled`, `taken-over`, `lost` for a 404 or a pairing it doesn't hold, or `unreachable` or `too_many`, keeping the pairing for those two. When the server allowed it, the host shall write the token to the keychain under `server-pairing__<key>`, read it back, then save the setting as "Server" and switch the workspace's hub, and answer `paired` with `sessionEndsAt`. If any of those steps fails, then the host shall delete the entry, end the session with `POST /api/devices/sign-out`, save no setting and answer `key_not_saved` with whether the sign-out worked.

When Studio switches a workspace back to "This computer", the host shall end the session on the server when it can, delete the keychain entry and the workspace's messaging cache, remove the setting and join "This computer", and answer `stillValid`: `true` when the server couldn't be reached or the token couldn't be read. If the keychain can't read or delete the entry, then the host shall still remove the setting, and answer `keychainEntryKept: true` when the entry stayed.

## Examples

- Given a server whose owner allows the request,
  when Studio polls the pairing,
  then the keychain holds the token, the setting is "Server", Studio's messaging lists the server's sources, and the answer is `{ state: "paired", sessionEndsAt }` with no token.
- Given a keychain whose write fails with a message that holds the token,
  when the server allows the request,
  then the host signs out with that token, saves no setting, answers `{ state: "key_not_saved", signedOut: true }`, and neither the answer nor the log holds the token.
- Given a paired workspace and a server that can't be reached,
  when Studio switches back to "This computer",
  then the token and the setting are gone and the answer is `{ stillValid: true }`.
- Given a workspace paired as "Work laptop",
  when the host restarts and Studio asks for its engine,
  then the answer says `deviceName: "Work laptop"`.
- Given a paired workspace whose server stopped answering,
  when the host's next call to it times out,
  then the engine's answer says `reach: { state: "offline", asOf }` with that call's time.
- Given a page of another site,
  when it asks to pair,
  then the host answers 403 and calls no server.
