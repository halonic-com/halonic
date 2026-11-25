# server.hello

- Status: active
- Since: unreleased
- Source: HAL-1128 (install and update flow, A1 to A3); build plan on HAL-195 (PR 4); `mode` and `minStudioVersion` from HAL-13348 (item 4), built on HAL-13265

The server shall answer `GET /api/hello` without a sign-in with a JSON body that has exactly six keys: `product`, always `halonic`; `version`, the server's version; `minAppVersion`, the oldest Android app this server works with; `runExecutorVersion`, the version of the `RunExecutor` port the server honors, so a remote executor can tell whether it takes what a version 2 `send` names; `mode`, `owner` for a server with one owner and `many` for a server built for many users (`users.mode: many`), so Studio attaches only to an owner's server; and `minStudioVersion`, the oldest Studio this server works with, a fixed floor of the protocol that changes only when a change breaks an older Studio, never the server's own version. It shall tell nothing else: no workspace name, host name or user. The route sits behind the same `Host` and `Origin` checks and the same daily request ceiling as every other route, so a server with no password still answers it only on loopback names.

Rationale: the Android app calls this route before it opens the served login, to see whether it can talk to this server. Julian confirms on HAL-196 that showing the version without a sign-in is acceptable.

## Examples

- Given a server at version 0.1.0 with no session, when the app asks `GET /api/hello`, then it gets status 200 and exactly `{ "product": "halonic", "version": "0.1.0", "minAppVersion": "0.1.0", "runExecutorVersion": 2, "mode": "owner", "minStudioVersion": "0.1.0" }`.
- Given a many-user server, when `GET /api/hello` arrives, then `mode` is `many`.
- Given a server at version 9.9.9, then `minStudioVersion` is still `0.1.0`.
- Given a server with no password, when `GET /api/hello` arrives with a `Host` that isn't loopback, then it is refused with 421.
