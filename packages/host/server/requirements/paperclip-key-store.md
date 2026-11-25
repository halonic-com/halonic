# server.paperclip-key-store

- Status: active
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §3, §5 and §6 (PR S4); Julian's security note on HAL-17513, findings S1, S8 and S9; key guard of HAL-17495. Built in HAL-18495, which stores the key under a token's name: the plan's `paperclip-key/<connection>` breaks the `Secrets` name rule (letters, digits, `-` and `_`), so no store could keep it.

The server shall keep each Paperclip key as the record `{ key, address, company }` in the serve profile's secrets file under the token name `paperclip-<connection>` (`halonic_token_paperclip-<connection>`), the token name the desktop keychain uses for the same connection, and shall read it from there only, at call time, through the key guard: never from an environment variable, a command-line argument, a file in the engine workspace or the service's unit. Before every call the guard shall compare the record's address and company with the connection file, and when they differ it shall make no call and report the source `signed-out`. The only way a client's request becomes a Paperclip call shall be the provider's fixed request list (`adapters/paperclip-client/src/requests.ts`, `agent-host.paperclip-key`). `/api/secrets/<name>` shall refuse that name, and any `paperclip-key/<connection>` path, for `GET`, `PUT` and `DELETE` with 400 `secret_name_refused`, as `server.secrets-refusals` refuses every token's name, whatever its case, `-` or `_`, percent-encoding, `..` segment or trailing slash; `halonic secret` shall neither set, remove nor list it. `serve` shall not start when a key is stored for one of the engine workspace's connections and no `serve-password` is set. No route's answer and no log entry shall hold a key. The server's messaging cache shall sit outside every served workspace, in files only the service user can read (mode 0600), under the rules of `agent-host.agent-messaging-offline`.

Rationale: a stolen device session then reaches at most the port, never the board key, and a deploy, an image or CI never holds the key, because only the owner adds it after deploy.

## Examples

- Given a stored key, when `GET /api/secrets/paperclip-key/acme` is sent, then it answers 400 `secret_name_refused`; and so do `PAPERCLIP-KEY/acme`, `paperclip-key%2Facme`, `a/../paperclip-key/acme`, `paperclip-key/acme/` and `HALONIC_TOKEN_PAPERCLIP-ACME`.
- Given a stored key and no `serve-password`, when `halonic serve` starts, then it exits with "Serving a Paperclip connection needs a sign-in password".
- Given a canary key in the store, when every route is called once, then no answer, request log or error log holds the canary.
- Given a connection file whose address changed after the key was stored, when the hub polls, then no call is made and the source is `signed-out`.
- Given `PAPERCLIP_KEY` set in the service's environment and no stored record, then the source is `signed-out`.
