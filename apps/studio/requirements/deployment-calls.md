# studio.deployment-calls

- Status: active
- Since: unreleased
- Source: HAL-20105, the plan Liam approved on it (26 Nov); HAL-13265 (RO-15); `server.event-stream`; `studio.src-tauri.deployment-call-commands`

When Studio reads the runs of an owner server it signed in to, every call shall go through the shell's `deployment_request` and `deployment_stream` commands with the one origin Studio was given and a route name from the shell's list (`GET /api/waiting-runs`, `GET /api/runs/{run}`, `GET /api/runs/{run}/events`), never a path, a URL or a header, and a route name off the list shall be refused before the shell is called. While Studio follows a run's events, when the stream breaks before the server's `end` event, Studio shall open it again after the last event it delivered, which the shell sends as `Last-Event-ID`, and shall drop an event whose id isn't after the last one delivered, so that no event is lost or repeated. It shall wait 1, 2, 4, 8 and 16 seconds before the next tries and give up after the fifth; an event that comes, or a stream that stayed open for a minute, shall start the count again. A stream the server refuses with a status other than 429 or 5xx, and a call the shell refuses other than for no answer or an unreadable one, shall end following without another try.

Rationale: the session stays in Rust (RO-15), so the page can only name what the shell allows. Server-sent events resume by id, and the server sends no keep-alive, so a quiet run's stream ends and is opened again from where it was.

## Examples

- Given a run's stream that delivers events 1 to 3 and breaks,
  when Studio opens it again and the server sends events 2 to 5 and `end`,
  then Studio opened it after 3, and delivered 1, 2, 3, 4 and 5 once each.
- Given a stream that keeps breaking before any event,
  then Studio tries again after 1, 2, 4, 8 and 16 seconds, and then ends following as failed.
- Given the server refuses the stream with 404,
  then Studio ends following as refused and doesn't try again.
- Given the page asks for a route name that isn't on the list,
  then it is refused and the shell is never called.
