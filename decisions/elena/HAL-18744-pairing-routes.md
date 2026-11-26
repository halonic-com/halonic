# Decision: the host pairs a workspace with a server and puts the device token straight into the keychain

- Task: HAL-18744
- Approval: Liam reviews this security PR and signs this note as the CTO; Julian gives the security sign-off on its review task
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:njj5DxgpWwR/q1LeeWMYryixjBlXZcfsSRzdEHcW+zD2OdYWX4DAQT91BsmyEyDuatwXi2I1XNSIMqnZvjpZDg==

## What changes

- A new requirement, `agent-host.server-engine-pairing` (`Since: unreleased`), S8a-3 of the plan on HAL-18501, approved by Liam with his conditions. And `agent-host-client.server-engine` (`Since: unreleased`) for `AgentHostServerEngine`, the page's stand-in S8b will use.
- **The route allow-list changes.** The shell's table `PAPERCLIP_ROUTES` (`apps/studio/src-tauri/crates/agent-host/src/paperclip_routes.rs`) and `agentHostRequestRoutes` gain five names, `POST /v1/messaging/server-engine/{state,pair,pair-status,pair-cancel,use-this-computer}`. The requirements that govern the table, `studio.src-tauri.agent-host-commands` (`Since: 0.1.0`) and `agent-host-client.shell-routes` (`Since: unreleased`), keep their text: they say a page may call only the table's routes, and `shell-routes.test.ts` still checks the two lists are equal. What these five may do is the new requirement's, `Since: unreleased`.
- **The paths sit under `/v1/messaging/`**, not `/v1/server-engine/` as the plan said (the task leaves paths free). On Windows the shell sends `/v1/messaging/` and `/v1/paperclip/` to the messaging-only host (`agent-host.messaging-only`), the one started with `--keychain-relay`, so the routes reach the host that has the keychain without changing that requirement or the shell's prefixes.
- **The token never reaches the page.** The host makes every call to the server (`GET /api/hello`, `POST /api/pair`, `/api/pair/status`, `/api/pair/cancel`, `/api/devices/sign-out`), follows no redirect, and reads a body only when the status says it holds what was asked; it never quotes a body. The server's pending ID, which collects the token, stays in the host's memory (at most 8 pairings) under a random pairing ID of the host's own.
- **The order on Allow:** write the token to the keychain (`server-pairing__<key>`), read it back, save the setting "Server", switch the hub. If any of that fails, the host deletes the entry, signs the token out on the server and answers `key_not_saved` with `signedOut`. No setting is written.
- **Switching back never leaves "Server"** (Liam's condition): sign out when the token can be read, delete the entry, delete the workspace's messaging cache, remove the setting, join "This computer". A token that can't be read answers `stillValid: true`; an entry the keychain won't delete answers `keychainEntryKept: true`; the setting goes either way.
- **No error text, only its kind** (Liam's condition): the log names a `KeychainError` or another error by its name, and only when the name is a plain word. A keychain's message, a platform `fetch` error and a server's answer body are never logged or answered.
- **No keychain, no pairing.** Without `--keychain-relay` the routes answer `409 keychain_needed`, so a token never goes to the profile's secrets file. The host now passes its keychain (`ShellKeychainSecretStore`, no file fallback) to `hostMessaging`, in the full host and the messaging-only host; until now nothing did, as the S8a-2 note said.
- `WorkspaceMessaging.leaveServer` deletes the workspace's whole messaging cache folder: while the engine was "Server" the local providers weren't joined, so what it held came from the server or is stale; their next reads fill it again. `MessagingEngineSetting.keyOf` gives the workspace's key without reading the setting.

## Why

The plan's rule is that the desktop holds as little as possible and the page holds no long-lived credential. Letting the host collect and store the token keeps it out of the WebView entirely, unlike the Paperclip key's sign-in, where the page hands the key to the keychain. Reading the token back before switching means the setting is "Server" only when the next start can really use it.

## Tests

No test was skipped or weakened. New, with `verifies("agent-host.server-engine-pairing", …)`: `apps/agent-host/src/messaging/server-pairing.test.ts` (9 tests: the success path through the real host server, every ending, `code_refused`, `too_many` with and without minutes, the address checks, cancel, 403, 409, 404) and `server-pairing-canary.test.ts` (7 tests: the canary token in no answer and no log line on the success path, a keychain write error, a keychain that gives back another value, a 5xx whose body repeats the token on the poll and on the sign-out; switching back with the server reachable, unreachable, and with a keychain that can't read or delete). With `verifies("agent-host-client.server-engine", …)`: `packages/adapters/agent-host-client/src/server-engine.test.ts` (4 tests). The host's log has one level, so "debug level included" is every line it writes. Making the log quote the error's text fails three canary tests (checked by hand).

## Covers

- apps/agent-host/src/messaging/server-pairing.ts
- apps/agent-host/src/messaging/server-pairing-client.ts
- apps/agent-host/src/messaging/server-pairing-routes.ts
- apps/agent-host/src/messaging/host-messaging.ts
- apps/agent-host/src/messaging/desktop-messaging.ts
- apps/agent-host/src/messaging/workspace-messaging.ts
- apps/agent-host/src/messaging/messaging-engine-setting.ts
- apps/agent-host/src/secrets/host-keychain.ts
- apps/agent-host/src/host.ts
- apps/agent-host/src/messaging-only.ts
- apps/studio/src-tauri/crates/agent-host/src/paperclip_routes.rs
- packages/adapters/agent-host-client/src/server-engine.ts
- packages/adapters/agent-host-client/src/transport.ts
- agent-host.server-engine-pairing
- agent-host-client.server-engine
