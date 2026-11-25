# server.messaging-needs-session

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §2 and §3 (PRs S2 and S4); Julian's security note on HAL-17513, findings S2 and S5

The server shall answer, on every route under `/api/messaging/`, 401 `not_signed_in` to a request that carries neither a live device session (`server.device-pairing`) nor a live password session (`server.session`), in every mode and from every address, loopback included: for these routes, a server with no password treats no request as signed in. A server in many-users mode shall not mount the messaging routes, and shall answer them 404 `not_found` like an unknown path, because every user would act with the one Paperclip key. When a Paperclip connection is configured and no `serve-password` is set, `serve` shall refuse to start the Paperclip provider and shall exit with a message that says to set the password first.

Rationale: a proxy on the same machine makes every outside request look like loopback, so "no password = signed in" would mean "everyone".

## Examples

- Given a server with no password, from `127.0.0.1`, with no cookie and no bearer token,
  when `GET /api/messaging/sources` is sent,
  then it answers 401 `not_signed_in`.
- Given a many-users server,
  when a signed-in user sends `GET /api/messaging/sources`,
  then it answers 404 `not_found`.
- Given a served workspace with `connections/paperclip/acme.yaml` and no `serve-password`,
  when `serve` starts,
  then it exits with the message and calls no provider.
