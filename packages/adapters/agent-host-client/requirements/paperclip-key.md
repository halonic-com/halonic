# agent-host-client.paperclip-key

- Status: active
- Since: unreleased
- Source: HAL-17495; ADR `docs/adr/2026-11-24-agent-messaging.md`; `agent-host.paperclip-key-hand-over`

The Paperclip key stand-in shall offer `handOver` with the workspace's path, a connection's name, its key and the address and company the key was made for, and ask the host's `POST /v1/paperclip/key` with those five and nothing else. It shall offer `disconnect` with the workspace's path and the connection's name, ask the host's `POST /v1/paperclip/disconnect` with those two, and answer whether Paperclip revoked the key. It shall fail with the host's kind and status when the host refuses, saying in plain words that Halonic takes a Paperclip key only from its own window for `secret_from_other_site`, and with `answer_invalid` for an answer that isn't `{ kept: true }`. No message shall hold the key.

## Examples

- Given a host that answers a hand-over with `{ kept: true }`,
  when Studio hands over the key of `halonic`,
  then the host gets `{ workspace, connection: "halonic", key, address, company }` and the hand-over succeeds.
- Given a host that refuses with 403 `secret_from_other_site`,
  when Studio hands over a key,
  then it fails with that kind and a message that holds no key.
- Given a host that answers something else with 200,
  when Studio hands over a key,
  then it fails with the kind `answer_invalid`.
- Given a host that answers a disconnect with `{ revoked: false }`,
  when Studio disconnects `halonic`,
  then the host gets `{ workspace, connection: "halonic" }` and the answer says the key wasn't revoked.
