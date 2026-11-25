# agent-host-client.agent-messaging

- Status: active
- Since: unreleased
- Source: HAL-17438; ADR `docs/adr/2026-11-24-agent-messaging.md` (the engine serves the port, deployment (a)); `agent-host.paperclip-key`, `agent-host.agent-messaging-offline`

The agent messaging stand-in shall be an `AgentMessaging` for one workspace that asks the agent host for every list with `POST /v1/messaging/read`, sends answers and messages with `POST /v1/messaging/answer` and `POST /v1/messaging/send`, reads an attachment's bytes, which the host sends as base64url, with `POST /v1/messaging/attachment`, each with the workspace's path, and passes on what the host answers. Its `changes` shall name each source the host reports changed after it started listening, asking `POST /v1/messaging/changes` with `wait: true` again as soon as the host answers, so the host holds each call until a source changes or about 25 seconds pass. It shall tell the host whether Studio's window is in front with `POST /v1/messaging/focus`. When the host refuses, it shall fail with the host's kind and status.

## Examples

- Given a host that lists Ada for `/work/acme`,
  when Studio lists the agents,
  then the host is asked with `{ workspace: "/work/acme", list: "agents" }` and Studio gets Ada.
- Given a host that answers 502 `messaging_failed`,
  when Studio lists the Inbox,
  then the read fails with that kind.
- Given a host whose change count is 4 when Studio starts listening,
  when `paperclip:halonic` changes,
  then `changes` names `paperclip:halonic` and not the sources that changed before.
