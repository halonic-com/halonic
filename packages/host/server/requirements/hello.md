# server.hello

- Status: active
- Since: 0.1.0
- Source: HAL-1128 (install and update flow, A1 to A3); build plan on HAL-195 (PR 4)

The server shall answer `GET /api/hello` without a sign-in with a JSON body that has exactly three keys: `product`, always `halonic`; `version`, the server's version; and `minAppVersion`, the oldest Android app this server works with. It shall tell nothing else: no workspace name, host name or user. The route sits behind the same `Host` and `Origin` checks and the same daily request ceiling as every other route, so a server with no password still answers it only on loopback names.

Rationale: the Android app calls this route before it opens the served login, to see whether it can talk to this server. Julian confirms on HAL-196 that showing the version without a sign-in is acceptable.

## Examples

- Given a server at version 0.1.0 with no session, when the app asks `GET /api/hello`, then it gets status 200 and exactly `{ "product": "halonic", "version": "0.1.0", "minAppVersion": "0.1.0" }`.
- Given a server with no password, when `GET /api/hello` arrives with a `Host` that isn't loopback, then it is refused with 421.
