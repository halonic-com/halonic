# server.waiting-runs

- Status: active
- Since: 0.1.0
- Source: HAL-10628 (part 1 of HAL-10618, runs waiting for an answer)

The server shall answer `GET /api/waiting-runs` for a signed-in caller with `{ "runs": [...] }`: the summaries of the runs in the run store whose status is `waiting`, newest start first, at most 100. It passes the same sign-in, `Host` and `Origin` checks and daily request ceiling as the other run routes (`server.run-routes`), needs no trust, changes nothing, and lists only runs of the workspace the server runs, because it reads only that workspace's run store. With no waiting run it answers an empty list. Another method on that path answers 404.

Rationale: a caller needs to find the runs that wait for its answer without knowing their ids. Listing only reads, so it needs no trust.

## Examples

- Given two waiting runs and one finished run, when `GET /api/waiting-runs` arrives signed in, then it answers the two waiting ones.
- Given no session on a server with a password, then `GET /api/waiting-runs` answers 401 and nothing is read from the store.
