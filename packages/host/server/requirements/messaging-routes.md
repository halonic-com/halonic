# server.messaging-routes

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §1 and §7 (PR S2); Julian's security note on HAL-17513, finding S7; ADR `docs/adr/2026-11-24-agent-messaging.md`, server engine (b)

Where the server runs in owner mode with the Paperclip provider started, it shall serve `/api/messaging/*` with one route per call of the `AgentMessaging` port (`ports.agent-messaging`): sources, inbox items, conversations, messages, search, answer, send and focus, and shall publish the port's `changes` on the event stream (`server.event-stream`). Each route shall take and answer only the port's own types, with opaque IDs, and never a provider's address, key, header or raw answer. A refusal from the port shall answer its `MessagingRefusal` code as the error code. The request log (`server.request-log`) shall record these routes by method, path and status only: never a body, a card's answer, the text of a message, an ID from a body or an answer from Paperclip. An error from the provider shall reach the error log without its headers or body.

Rationale: the routes are the desktop's only way to the server's provider, so they carry nothing the port doesn't, and a log can't hold the board's private data.

## Examples

- Given a server in owner mode with `FakeAgentMessaging` behind the routes,
  when the `AgentMessaging` contract tests that `contracts.fake-agent-messaging` passes run against the routes,
  then it passes.
- Given a send whose text holds a canary string,
  when the provider fails it,
  then neither the request log nor the error log holds the canary.

## What it doesn't cover

Who may call the routes is `server.messaging-needs-session`, and how often is `server.messaging-rate`.
