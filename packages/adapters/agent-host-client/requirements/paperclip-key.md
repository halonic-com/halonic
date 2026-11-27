# agent-host-client.paperclip-key

- Status: active
- Since: unreleased
- Source: HAL-17495; ADR `docs/adr/2026-11-24-agent-messaging.md`; `agent-host.paperclip-key-hand-over`; HAL-20278 (the hand-over left the page for the shell, `studio.src-tauri.paperclip-key-keep`)

The Paperclip key stand-in shall offer `disconnect` with the workspace's path and the connection's name, ask the host's `POST /v1/paperclip/disconnect` with those two, and answer whether Paperclip revoked the key. It shall fail with the host's kind and status when the host refuses. The stand-in shall offer no way to hand a key over, as only the shell does that.

## Examples

- Given a host that answers a disconnect with `{ revoked: false }`,
  when Studio disconnects `halonic`,
  then the host gets `{ workspace, connection: "halonic" }` and the answer says the key wasn't revoked.
- Given a host that refuses a disconnect with 404 `unknown_workspace`,
  when Studio disconnects `halonic`,
  then it fails with that kind and status.
