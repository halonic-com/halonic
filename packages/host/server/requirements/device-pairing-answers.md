# server.device-pairing-answers

- Status: draft
- Since: unreleased
- Source: HAL-18622 `flow` §7.2 and its endings E1–E5 (the Studio pairing dialog, S8); built in HAL-18626 on `server.device-pairing`

The server shall also answer `expiresAt` to `POST /api/pair`, when the request ends unless it is allowed. `POST /api/pair/status` with a pending ID of a request that is still kept shall answer `{ "state": "waiting", "expiresAt" }` with 202 while it waits; `{ "state": "allowed", "token", "sessionEndsAt" }` once, where `sessionEndsAt` is 90 days after the session started; and otherwise why it ended: `expired` once it was neither allowed nor collected within 10 minutes, `refused` after the owner's Deny, `cancelled` after its device cancelled it, or `taken-over` after a second request used the same code. A request shall be kept for 10 minutes after its end, and a used, guessed or no longer kept pending ID shall answer 404 and nothing else. `POST /api/pair/cancel` with a pending ID shall end its request, allowed or not, before the token is collected; after that neither Allow nor polling shall start a session, and the code shall stay used. `POST /api/devices/deny` with a request's id, from any session, shall end a request that isn't allowed yet; Allow on it shall then be refused. `POST /api/devices/sign-out` shall end only the session of the device whose token is in `Authorization: Bearer`, and shall refuse a password session with 403 `not_a_device`. A client shall tell a Halonic server by `GET /api/hello` (`server.hello`), whose `product` is `halonic` and which names no device, session or request. The pairing record's version shall change with these states, so a build that doesn't know them reads no requests.

Rationale: the Studio pairing dialog shows a countdown, the session's end date, and a different ending for each outcome, and it ends its own pairing when the user switches back to this computer. Denying grants nothing, so it needs a session but not the password again.

## Examples

- Given a cancelled pending ID, when it is polled, then the answer is `{ "state": "cancelled" }`, and Allow on its request answers 404.
- Given devices A and B, when A signs out with its own token, then A's token is refused and B's is still accepted.
- Given a waiting request on a fake clock 10 minutes later, when it is polled, then the answer is `{ "state": "expired" }`.
- Given a guessed pending ID, when it is polled or cancelled, then the answer is 404.
- Given an allowed request, when it is polled, then `sessionEndsAt` is 90 days after now.
