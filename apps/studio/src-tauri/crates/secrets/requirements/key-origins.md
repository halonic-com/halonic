# studio.src-tauri.crates.secrets.key-origins

- Status: draft
- Since: unreleased
- Source: HAL-11887; `studio.src-tauri.key-origin-commands`; `KeyOrigins` and `maxAllowedOrigins` in `@halonicjs/ports`; `addAllowedOrigin` in `@halonicjs/adapter-secrets-file` (HAL-11871)

The secret store shall let a stored key hold the origins its value may be sent to, one to eight, kept beside the key and apart from its value. `allowed_origins` shall check the name as `secret_get` does, refuse Halonic's own names with `reserved_name`, and return the key's origins in the order they were allowed, or nothing when none is recorded. `allow_origin` shall check the name the same way and add one origin to the list, keeping the others, and shall answer `no-key` when no key is stored under the name, `already-allowed` when the origin is on the list, and `full` when the list holds eight or one more wouldn't fit the backend's entry (1,280 bytes in the Windows Credential Manager), writing nothing in those three cases. It shall refuse an origin that is empty or holds anything but printable ASCII with `invalid_value`. A new value for the key shall keep its origins. Deleting the key shall remove its origins first and then its value, so a failure halfway never leaves origins that a new key under the same name would take over. A stored list that isn't one `allow_origin` writes (an empty line, a repeat, more than eight) shall be refused with `backend`, never read as no list, and the message shall name no origin. Every backend shall pass these cases in the same contract check as its values.

## Examples

- Given the key `acme-key` and the origin `https://llm.example.com` allowed for `Acme_Key`,
  when `allowed_origins` reads `ACME-KEY`,
  then it returns `https://llm.example.com`.
- Given no key stored under `acme-key`,
  when `allow_origin` adds `https://llm.example.com`,
  then it answers `no-key` and nothing is written.
- Given a key with eight origins,
  when `allow_origin` adds a ninth,
  then it answers `full` and the list stays as it was.
- Given a key whose list holds the same origin twice,
  when `allowed_origins` reads it,
  then it is refused with `backend`.
- Given a key with an origin,
  when the key gets a new value,
  then the origin stays; when the key is deleted and stored again, it has no origins.
- Given a backend that can't remove the list,
  when the key is deleted,
  then the delete fails and the key's value stays.
