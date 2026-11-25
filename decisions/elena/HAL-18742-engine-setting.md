# Decision: each workspace's messaging engine is a profile setting, and "Server" swaps the hub's provider

- Task: HAL-18742
- Approval: Liam reviews this security PR and signs this note as the CTO; Julian gives the security sign-off on its review task
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0opBrTbh4DCekd4iowR0XtIWee67IiU4wPkShulYnquw4AHuLKmicwwFwAAkvGgrnDuNWcghmA58D+AEPNWDBA==

## What changes

- A new requirement, `agent-host.messaging-engine` (`Since: unreleased`), S8a-2 of the plan on HAL-18501, approved by Liam with his conditions.
- **The setting lives in the profile, never in the workspace.** `MessagingEngineSetting` reads and writes `workspaces/<key>/messaging-engine.json`, `{ "version": 1, "engine": "server", "address": "<origin>" }`. The key comes from the profile's `workspaceFolders`, so a `git pull` can't change the engine, and a `messaging-engine.json` inside the workspace is never read. No file means "This computer". A save writes a temporary file with mode 0600 and renames it over the setting. The file never holds a token.
- **The address follows S3's client rule.** `checkedServerOrigin` (now exported by `@halonicjs/host-server`, the same function `ServerAgentMessaging` uses) checks it: `https`, or plain `http` to this computer only, with no user, path, query or fragment. A save with another address is refused. A file with one is read as "This computer".
- **A setting it can't use is "This computer" with one warning, never a crash:** unreadable, not JSON, another version (a newer one is named as such), or a field it doesn't know. The warning never quotes the file.
- **"Server" swaps only the hub's provider.** With a device token from the keychain (`server-pairing__<key>`, S8a-1), `WorkspaceMessaging` joins one `ServerAgentMessaging` in place of every Paperclip provider, behind a `CachedAgentMessaging` over the same cache folder. Studio's routes don't change. Without a token, or when the keychain can't be read, it joins nothing, so Studio reads the workspace as signed out. The Paperclip providers and keys kept before are joined again when the setting is "This computer" again. The server's team status (runs and pull requests) is empty for now.
- **No local Paperclip while it is "Server".** `POST /v1/paperclip/key`, `POST /v1/paperclip/sign-in/start` and `POST /v1/paperclip/disconnect` answer `409 server_engine` before they keep a key or call Paperclip. `WorkspaceMessaging.connect` and `disconnect` refuse it too (`ServerEngineInUse`), so no other caller gets past it.
- `hostMessaging` takes the host's keychain as an optional `pairingSecrets`. Nothing passes one yet, so in the app every workspace with a "Server" setting reads as signed out until S8a-3 wires the keychain with its pairing routes. Nothing in this PR writes the setting outside tests either: S8a-3's `pair-status` and `use-this-computer` do.

## Why

The server engine must never be chosen by a pulled file: it decides where every message goes and which token is sent. Keeping the setting next to the workspace's other per-person state in the profile, keyed by the profile's own rule, makes that structural. The 409 keeps the two engines from running side by side, where a person could answer an inbox item in one and not see it in the other.

## Tests

No test was skipped or weakened. New: `apps/agent-host/src/messaging/messaging-engine.test.ts` (15 tests, `verifies("agent-host.messaging-engine", …)`). `desktop-messaging.test-helper.ts` gains a fake server, the keychain and the setting, and every test that uses it still passes unchanged.

## Covers

- apps/agent-host/src/messaging/messaging-engine-setting.ts
- apps/agent-host/src/messaging/server-engine.ts
- apps/agent-host/src/messaging/workspace-messaging.ts
- apps/agent-host/src/messaging/desktop-messaging.ts
- apps/agent-host/src/messaging/host-messaging.ts
- apps/agent-host/src/messaging/messaging-routes.ts
- apps/agent-host/src/paperclip/paperclip-key-routes.ts
- apps/agent-host/src/paperclip/paperclip-sign-in-routes.ts
- agent-host.messaging-engine
