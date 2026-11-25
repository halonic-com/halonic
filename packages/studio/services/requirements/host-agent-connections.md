# services.host-agent-connections

- Status: active
- Since: unreleased
- Source: HAL-17439 (PR 2, the wiring; Liam's option 1 for the key, 24 Nov), HAL-17897 (Settings › Connections in the app), HAL-17942 (the confirm); ADR `docs/adr/2026-11-24-agent-messaging.md`, sections "Sign-in" and "The key"; `agent-host.paperclip-key`

The desktop app's `AgentConnections` shall list the agent host's connections for the open workspace, start a sign-in through the host for an address (and, for Sign in again, the listed connection's name), and poll the host every 2 seconds until the sign-in ends. When a poll says `connected`, it shall write the key from that answer straight to the keychain entry of the connection, `paperclip-<name>`, with the address and company it was made for, and pass on no key: the sign-in's result names only the connection. Once the keychain has the key, it shall confirm the sign-in to the host. When the keychain write or the confirm fails, it shall cancel the sign-in, so the host revokes the key and undoes it, remove the keychain entry it wrote, end the sign-in as `key-not-saved` and keep no copy. A poll that fails shall be tried again until the sign-in's 10 minutes have passed. Disconnect shall go through `services.paperclip-disconnect`, and the listeners shall hear every connect and disconnect.

## Examples

- Given a sign-in the board approves,
  when the poll answers the key,
  then the keychain holds it under `paperclip-acme`, and the result holds only the connection "Paperclip · Acme".
- Given a keychain that refuses the write,
  when the board approves,
  then the sign-in is cancelled through the host and ends as `key-not-saved`.
- Given a host that can't be reached for the confirm,
  when the board approves,
  then the keychain entry is removed, the sign-in is cancelled and it ends as `key-not-saved`.
- Given a host that doesn't answer polls,
  when the sign-in's 10 minutes have passed,
  then it ends as `expired`.
