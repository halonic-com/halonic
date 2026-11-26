# studio.src-tauri.deployment-call-commands

- Status: draft
- Since: unreleased
- Source: HAL-20105; the plan Liam approved on HAL-20105 (26 Nov); `server.event-stream` in `packages/host/server`; `studio.src-tauri.owner-sign-in-commands`

When the page calls `deployment_request` or `deployment_stream` with an origin, a route name and a run id, the shell shall call only `GET /api/waiting-runs`, `GET /api/runs/<run>` or the stream `GET /api/runs/<run>/events`, shall refuse any other route name (`unknownRoute`) and a run that isn't a run id or that the route doesn't take (`badRun`) before any call, and shall never encode a value into the path. The shell shall call only an origin it keeps an owner session for, and only at the addresses the connect check pins, without a proxy, adding that session's cookie itself; for any other origin it shall answer `notSignedIn` and call nothing. It shall follow no redirect and answer one as `redirected`. A stream opened with `after` shall send it as `Last-Event-ID`. Every call shall have a 10 s connect limit and a 30 s limit for its answer or the opening of its stream; a stream that sends nothing for 2 minutes shall end as broken; a JSON answer over 4 MiB or an event over 1 MiB shall be refused. The page shall learn only the server's status and body, the stream's events, or a code; no code or message shall hold the session, the origin or the address called. The commands shall be granted to the app's own local main window on desktop only, never to the Studio the computer serves.

Rationale: the web view must never hold a session (RO-15), and a page that could name a path, a host or a header could send the session anywhere. A fixed list of read routes keeps the page to reading runs; answers come later, by answer handle (RO-4).

## Examples

- Given a session kept for `https://halonic.example`,
  when the page asks for `GET /api/runs/{run}` with the run `a/b`,
  then the answer is `badRun` and nothing is sent.
- Given a session kept for `https://halonic.example` only,
  when the page asks for the waiting runs of `https://other.example`,
  then the answer is `notSignedIn` and nothing is sent.
- Given a server that answers the waiting runs with a 302,
  when the page asks for them,
  then the answer is `redirected` and the redirect is not followed.
- Given the page asks for `POST /api/runs/{run}/events`,
  then the answer is `unknownRoute` and nothing is sent.
