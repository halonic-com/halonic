# studio.desktop-connections

- Status: active
- Since: unreleased
- Source: HAL-17897 (the board couldn't find Connections in the phase 1 preview build, 24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md`, section "Sign-in"; `connections.connection-row`, `services.host-agent-connections`

The desktop app shall register the connections feature and give each open folder the agent host's connections, so Settings › Connections shows and Connect Paperclip signs in through the agent host. A page without the agent host's transport shall get no connections, and Settings shall show no Connections section there.

## Examples

- Given the desktop app's features,
  when the shell is created,
  then Settings has a Connections section.
- Given a desktop folder that is opened with the agent host,
  when its services are built,
  then it has the connections that Settings › Connections reads, so the section shows.
- Given a page without the agent host's transport,
  when a folder gets its services,
  then no connections are provided and the section doesn't show.
