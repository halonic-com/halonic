# agent-host-client.paperclip-sign-in

- Status: active
- Since: unreleased
- Source: HAL-17439 (PR 2, the wiring), HAL-17897 (Settings › Connections in the app), HAL-17942 (the confirm, which only the shell sends since HAL-20278); ADR `docs/adr/2026-11-24-agent-messaging.md`, section "Sign-in"; `agent-host.paperclip-sign-in`

The Paperclip sign-in stand-in shall offer `connections`, which asks the host's `POST /v1/paperclip/connections` with the open workspace's path and answers each connection's ID, name, label, address and state; `start`, which asks `POST /v1/paperclip/sign-in/start` with the workspace, the address and, when given, the connection's name; and `poll` and `cancel`, which ask `POST /v1/paperclip/sign-in/poll` and `/cancel` with the sign-in's ID. It shall answer the host's outcome or state as it came, where an approved `connected` state names the connection, address and company and holds no key, and `key-not-saved` says the shell couldn't keep it, and fail with the host's kind and status when the host refuses, or with `answer_invalid` for an answer of another shape.

## Examples

- Given a host that answers a start with a phrase and an approval page,
  when Studio starts a sign-in at `https://paperclip.acme.test`,
  then the host was asked with the workspace and that address only, and the answer holds the phrase.
- Given an approved poll whose answer holds a key,
  when Studio polls,
  then the call fails with `answer_invalid`.
- Given a host that refuses a poll with 403 `secret_from_other_site`,
  when Studio polls,
  then the call fails with that kind and status.
