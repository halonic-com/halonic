# agent-host-client.server-engine

- Status: draft
- Since: unreleased
- Source: HAL-18744 (S8a-3 of the S8a plan on HAL-18501, approved by Liam); `agent-host.server-engine-pairing`

The server engine stand-in shall offer `state` and `useThisComputer`, which ask the host's `POST /v1/messaging/server-engine/state` and `/use-this-computer` with the open workspace's path; `pair`, which asks `/pair` with the workspace, the server's address, the pairing code and this computer's name; and `status` and `cancel`, which ask `/pair-status` and `/pair-cancel` with the pairing's ID. It shall answer the host's state as it came, and fail with the host's kind and status when the host refuses, or with `answer_invalid` for an answer of another shape, a field it doesn't know included, so an answer that holds a token is never passed on.

## Examples

- Given a host that answers a pairing's status with `{ state: "paired", sessionEndsAt }`,
  when Studio asks for it,
  then it gets that answer, and the host was asked with the pairing's ID only.
- Given a host without a keychain, which refuses with 409 `keychain_needed`,
  when Studio reads the workspace's engine,
  then the call fails with that kind and status.
