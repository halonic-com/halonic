# server.waiting-runs

- Status: active
- Since: unreleased
- Source: HAL-10628 (part 1 of HAL-10618, runs waiting for an answer); HAL-13830 (the agents' names)

The server shall answer `GET /api/waiting-runs` for a signed-in caller with `{ "runs": [...], "agents": {...} }`: the summaries of the runs in the run store whose status is `waiting`, newest start first, at most 100, and, by id, the names of the agents and subagents those runs' approvals name, as the workspace's agent files say. An id whose name the host can't give is left out of `agents`; when the names can't be read at all, `agents` is empty, the cause goes to the error log, and the runs are still listed. When no listed approval names an agent, the names aren't read. It passes the same sign-in, `Host` and `Origin` checks and daily request ceiling as the other run routes (`server.run-routes`), needs no trust, changes nothing, and lists only runs of the workspace the server runs, because it reads only that workspace's run store. With no waiting run it answers an empty list. Another method on that path answers 404.

Rationale: a caller needs to find the runs that wait for its answer without knowing their ids. Listing only reads, so it needs no trust. A person reads an approval by the agent's name, as `halonic run` and the desktop show it, and a served page can't read the agent files itself.

## Examples

- Given two waiting runs and one finished run, when `GET /api/waiting-runs` arrives signed in, then it answers the two waiting ones.
- Given no session on a server with a password, then `GET /api/waiting-runs` answers 401 and nothing is read from the store.
- Given a run waits on an approval of agent `writer`, whose file names it "Writer", then the list answers `"agents": { "writer": "Writer" }`.
- Given the agent files can't be read, then the list still answers the waiting runs, with `"agents": {}`.
