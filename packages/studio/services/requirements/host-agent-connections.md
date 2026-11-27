# services.host-agent-connections

- Status: active
- Since: unreleased
- Source: HAL-17439 (PR 2, the wiring; Liam's option 1 for the key, 24 Nov), HAL-17897 (Settings › Connections in the app), HAL-17942 (the confirm), HAL-18048 (keeping the old key), HAL-20278 (the shell keeps the key, `studio.src-tauri.paperclip-key-keep`); ADR `docs/adr/2026-11-24-agent-messaging.md`, sections "Sign-in" and "The key"; `agent-host.paperclip-key`

The desktop app's `AgentConnections` shall list the agent host's connections for the open workspace, start a sign-in through the host for an address (and, for Sign in again, the listed connection's name), and poll the host every 2 seconds until the sign-in ends. The poll's answer shall hold no key, since the shell keeps it (`studio.src-tauri.paperclip-key-keep`). When a poll says `connected`, the sign-in's result shall name only the connection, and when it says `key-not-saved`, the sign-in shall end as `key-not-saved`. It shall neither write, remove nor confirm a key. A poll that fails shall be tried again until the sign-in's 10 minutes have passed. Disconnect shall ask the host to revoke and forget the connection's key, and the shell deletes its keychain entry. The listeners shall hear every connect and disconnect.

## Examples

- Given a sign-in the board approves,
  when the poll answers `connected`,
  then the result holds only the connection "Paperclip · Acme", and Studio's page wrote nothing to the keychain.
- Given a shell that couldn't keep the approved key,
  when the poll answers `key-not-saved`,
  then the sign-in ends as `key-not-saved`.
- Given a host that doesn't answer polls,
  when the sign-in's 10 minutes have passed,
  then it ends as `expired`.
