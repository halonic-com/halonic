# agent-host.server-engine-pairing

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, section 7 (S8); S8a plan on HAL-18501 (S8a-3), approved by Liam (25 Nov) with his conditions (canary on the error paths, no unredacted error text, switch back never leaves "Server"); Sofia's flow on HAL-18622; HAL-18744; HAL-19698 (S8c, the state's name, end and server check); security review pending (Julian, then Liam)

The agent host shall serve `POST /v1/messaging/server-engine/state`, `/pair`, `/pair-status`, `/pair-cancel` and `/use-this-computer`, and the shell's route table (`studio.src-tauri.agent-host-commands`, `agent-host-client.shell-routes`) shall let a page call these five. Each shall refuse a request from another site with 403 `secret_from_other_site` before reading its body, shall answer 409 `keychain_needed` when the host has no keychain (no `--keychain-relay`), and shall answer 404 `unknown_workspace` for a folder the launcher didn't name. No answer of these routes, and no line the host logs, shall hold the device token, the server's pending ID or the text of a keychain's, the platform's or the server's error.

When Studio asks for a workspace's state, the host shall answer "This computer" with this computer's own name (its host name without `.local`, left out when the server wouldn't take it as a name), or "Server" with the address, whether the keychain holds the pairing (`kept`, `missing` or `unreadable`), and the `computerName` and `sessionEndsAt` the pairing gave. While the keychain holds the pairing, the host shall also ask the server's `GET /api/messaging/sources` once with the device token in the `Authorization` header only, and answer `server` with `online` when it answered, `signed-out` for a 401 and `offline` for no answer within 5 seconds or any other, with `checkedAt`.

When Studio starts a pairing with a server's address, a pairing code and this computer's name, the host shall refuse an address that isn't `https`, nor plain `http` to this computer, as `address_not_allowed`, shall check `GET /api/hello` and answer `not_halonic` or `unreachable` when it doesn't answer as a Halonic server, and shall then ask `POST /api/pair`, keep the server's pending ID in memory under a pairing ID of its own, and answer `waiting` with that ID, the check code and `expiresAt`; a 401 shall be `code_refused` and a 429 `too_many`, with the minutes of its `Retry-After` when given.

When Studio asks where a pairing stands, the host shall ask the server once and answer `waiting` with `expiresAt`, `expired`, `refused`, `cancelled`, `taken-over`, `lost` for a 404 or a pairing it doesn't hold, or `unreachable` or `too_many`, keeping the pairing for those two. When the server allowed it, the host shall write the token to the keychain under `server-pairing__<key>`, read it back, then save the setting as "Server" with the name it paired as and `sessionEndsAt`, and switch the workspace's hub, and answer `paired` with `sessionEndsAt`. If any of those steps fails, then the host shall delete the entry, end the session with `POST /api/devices/sign-out`, save no setting and answer `key_not_saved` with whether the sign-out worked.

When Studio switches a workspace back to "This computer", the host shall end the session on the server when it can, delete the keychain entry and the workspace's messaging cache, remove the setting and join "This computer", and answer `stillValid`: `true` when the server couldn't be reached or the token couldn't be read. If the keychain can't read or delete the entry, then the host shall still remove the setting, and answer `keychainEntryKept: true` when the entry stayed.

Where the server sits behind Cloudflare Access (HAL-19107), the pairing route shall also take an `accessClientId` and `accessClientSecret`, both or neither (400 `bad_access` for one, and for a value a header can't carry), and the host shall send them as `CF-Access-Client-Id` and `CF-Access-Client-Secret` on every call to the paired address and to no other. When Allow comes, the host shall keep them in the same keychain entry as the device token, and on `POST …/access` replace or clear them without pairing again, read the entry back, ask the server once and answer `saved` with what the server answered, or `not_paired` or `key_not_saved`. If the server redirects a call or its access check answers 403, then the host shall answer `access_refused` (and `access-refused` for the state's check), and the state shall say `accessSet: true` while values are kept. Neither value shall appear in an answer, a log line, the profile or the workspace's files.

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
- Given a workspace paired as "Work laptop" whose server stopped answering,
  when the host has started again and Studio asks for the state,
  then the answer holds `computerName: "Work laptop"`, the pairing's `sessionEndsAt` and `server: { state: "offline", checkedAt }`, and no token.
- Given a server behind Cloudflare Access that redirects every call to its login,
  when Studio pairs with an Access client ID and secret,
  then the answer is `{ state: "access_refused" }`, the redirect is not followed and no other address is called.
- Given a paired workspace and a rotated service token,
  when Studio sends the new client ID and secret,
  then the keychain entry holds them with the device token, the next call carries them, and the answer is `{ state: "saved", server: "online" }`.
- Given a page of another site,
  when it asks to pair,
  then the host answers 403 and calls no server.
