# studio.served-inbox-runs

- Status: active
- Since: unreleased
- Source: HAL-10629 (part 2 of HAL-10618, the Inbox on a phone); server.waiting-runs, server.run-routes; HAL-13830 (the agents' names)

The served Studio shall give its Inbox the runs of the workspace it serves: the runs waiting for an answer from `GET /api/waiting-runs`, and each answer (approve, reject or a wait step's own event) as `POST /api/runs/<runId>/events` with the event, its payload and, for a tool call, its `callId`, all on the page's own address and session. While anything listens, it shall read the list as soon as the first listener arrives, then again every 10 seconds and when the window comes to the front, and tell its listeners only when a waiting run appeared, moved on or went. A list or an answer that the computer refuses, doesn't answer or answers with something unreadable shall fail with an error kind (`unauthenticated`, `denied`, `not_found`, `conflict`, `limit_reached`, `invalid_input` or `unavailable`) and a sentence of Halonic's own, never the computer's text, a request that gets no answer within 15 seconds shall fail as `unavailable`, and a failed poll shall not stop the next one; when the first read failed, the listeners hear after the next good one. It shall name each agent and subagent as the last readable list's `agents` names it, and by its id when that list doesn't name it. An `agents` value it can't read, or none, shall never fail the list: it keeps the names the last readable one gave.

## Examples

- Given two runs wait, then `waiting()` gives those two summaries.
- Given the list names agent `writer` "Writer", then the Inbox reads "Writer wants to use read_note"; given it names no `sorter`, then `sorter` shows by its id.
- Given the list's `agents` is a list rather than names, then the runs are still listed.
- Given a run waits at a tool call, when you approve it, then the page posts `approve` with that call's `callId` to the run's address and the answer is the run's new summary.
- Given the computer answers 409 to an answer, then `send` fails as `conflict` and the item stays in the Inbox.
- Given the list changes between two polls, then the listeners hear once; given it doesn't, they hear nothing.
