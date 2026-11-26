# Decision: the state route answers the computer's name, the pairing's end and whether the server answers

- Task: HAL-19698
- Approval: Liam reviews this security PR and signs this note as the CTO; Julian gives the security sign-off
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e0bUpcG1lVZRWhN/88kf2GueeGBoJA3nfvN17nbEf8j00D9mv/uar9X23GoikUR7uSCQ9QN11F3zx2wGzMbSAA==

## What changes

- **`POST /v1/messaging/server-engine/state` answers more** (`agent-host.server-engine-pairing`, `Since: unreleased`). On "This computer": `computerName`, this computer's host name without `.local`, for the name Pair with a server fills in (it filled in "Halonic Studio" before). On "Server": the `computerName` this computer paired as and the pairing's `sessionEndsAt`, and while the keychain holds the pairing, `server: { state, checkedAt }`.
- **One new call to the server, with the device token.** For `server`, the host asks `GET /api/messaging/sources`, the call the hub's server client already makes with the same token (`server.messaging-client`), once per state request: 2xx is `online`, 401 `signed-out` (the server ended the pairing), and no answer within 5 seconds, a redirect, a 5xx or anything else `offline`. The token goes in the `Authorization` header only, the body is never read, and the answer holds only that word and the time. No call is made when the keychain holds no pairing or couldn't be read.
- **The setting file keeps two more fields** (`agent-host.messaging-engine`, `Since: unreleased`): `computerName` and `sessionEndsAt`, written on Allow with the address. They hold no secret: the name is what the person typed and the server lists, the end is the date the server gave. A name that the server's own pattern wouldn't take (control or format characters, over 80) or an end that isn't a date is left out on write and on read, never trusted; the setting stays "Server". Any other field still makes the file read as "This computer". A file written before this change reads as before, without the two fields. A Halonic from before this change reads a file with them as "This computer" with its one warning; nothing has been released with the server engine, so no installed copy meets one.
- **The Messaging engine row reads all of it from the host** (`connections.engine-row`): the meta line "Checked 14:02 · pairing ends 23 Feb 2027", Offline with "Offline, as of 14:02" and the server's offline callout, and Signed out for a 401, also after Studio starts again; before, the meta line showed only in the window that paired. Switching back names the computer as the server lists it (Sofia's case on this task: paired as "Work laptop", the still-valid callout said "Remove Halonic Studio"). "Halonic Studio" stays only for a host that knows neither name.
- `AgentHostServerEngine`'s state schema takes the new fields, still `.strict()`, so an answer with any other field, a token among them, fails as `answer_invalid`.

## Why

Sofia's flow (HAL-18622) and Noah's screen (HAL-18623) have these states; S8b couldn't show them because the route didn't answer them. Checking on the host, not the page, keeps the token out of the WebView as S8a-3 decided. Keeping the name and the end in the profile's setting file, not the keychain, keeps the keychain to the one secret and lets the row show them after a restart without a second keychain read.

## Wording

New strings: only the server's offline callout, "The server isn't answering. Inbox and Messenger show what was read last; answering is off until it's back.", as Sofia's flow on HAL-18622 has it (Connect's offline callout with "The server" for "Paperclip"). "Offline", "Offline, as of 14:02", "Checked 14:02" and the other texts are already approved and used as they are.

## Tests

No test was skipped or weakened. Changed: `server-pairing.test.ts` expects the new fields in the state after pairing; `engine-row.test.tsx`'s pairing test gives the row the state the host now answers. New, with `verifies("agent-host.server-engine-pairing", …)`: `server-pairing-state.test.ts` (5 tests: This computer's name, the name and end after the host starts again, offline for no answer and a 503, signed-out for a 401, no call without a pairing, the host name rule) and a canary test in `server-pairing-canary.test.ts` (a check answered with 500 and 401 bodies that repeat the token, and no answer: the token is in no answer and no log line, and went in the `Authorization` header only). With `verifies("agent-host.messaging-engine", …)`: the setting keeps the two fields and leaves out a bad name and end. With `verifies("agent-host-client.server-engine", …)`: the new fields pass, a token in the server check fails. With `verifies("connections.engine-row", …)`: the meta line after a restart, Offline, Signed out by the server, the name in P1, and the switch-back callout naming "Work laptop" (fails before the fix with "Halonic Studio").

## Covers

- apps/agent-host/src/messaging/server-pairing.ts
- apps/agent-host/src/messaging/server-pairing-client.ts
- apps/agent-host/src/messaging/server-pairing-routes.ts
- apps/agent-host/src/messaging/messaging-engine-setting.ts
- packages/adapters/agent-host-client/src/server-engine.ts
- packages/studio/features/connections/src/engine/engine-row.tsx
- agent-host.server-engine-pairing
- agent-host.messaging-engine
- connections.engine-row
