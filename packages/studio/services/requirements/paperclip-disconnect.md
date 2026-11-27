# services.paperclip-disconnect

- Status: retired
- Since: unreleased
- Source: HAL-17438; ADR `docs/adr/2026-11-24-agent-messaging.md` (the key: "Disconnecting revokes the key and deletes the keychain entry and the cache"); `agent-host.paperclip-key`; retired by HAL-20278: the shell deletes the keychain token (`studio.src-tauri.paperclip-key-keep`)

When the person disconnects a Paperclip connection, `disconnectPaperclip` shall ask the agent host to revoke the key and delete the connection's cache, and shall then delete the keychain token `paperclip-<connection>`, answering whether Paperclip revoked the key. It shall delete the token also when the revoke failed, and also when the host can't be asked, and only then fail with the host's error.

## Examples

- Given a connected `halonic` and a host that revokes the key,
  when the person disconnects it,
  then the token `paperclip-halonic` is deleted and the answer says the key was revoked.
- Given a host that answers that Paperclip didn't revoke the key (offline),
  when the person disconnects `halonic`,
  then the token is deleted and the answer says the key wasn't revoked, so Studio says it stays valid until its expiry.
- Given a host that can't be reached,
  when the person disconnects `halonic`,
  then the token is deleted and the disconnect fails with the host's error.
