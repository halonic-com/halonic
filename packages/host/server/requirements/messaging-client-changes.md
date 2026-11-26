# server.messaging-client-changes

- Status: draft
- Since: unreleased
- Source: HAL-19583, a follow-up from the review of the shared messaging poll loop (HAL-19493), which ends the server's `changes` stream when its own feed fails; HAL-19623 adds 5xx answers; builds on `server.messaging-client`

When the server's `changes` stream ends, the server can't be reached, or it answers `changes` with a 5xx status that carries no refusal's code (as a reverse proxy does while the server restarts), while a reader still reads `ServerAgentMessaging.changes()`, the client shall open `changes` again after a wait, so the reader keeps hearing changes. The wait shall be 1 second, doubling after each stream or open that named no change, up to 60 seconds, and 1 second again after a stream that named a change. Once the reader stops, the client shall open nothing again. If the server refuses `changes` for any reason but `offline` (a 401 makes it `signed-out`), or answers it with any other error status, the client shall throw and open nothing again. Other calls keep throwing on a 5xx answer.

Rationale: Studio's Inbox and Messenger stop following when `changes` ends, so a server that restarts or ends a failed stream would otherwise leave them deaf until the app restarts. The growing wait keeps a server that is down from being asked every second.

## Examples

- Given a server whose first `changes` stream ends after one change,
  when a change is sent on the stream the client opens next,
  then the reader hears both, and the client waited 1 second between them.
- Given a server that can't be reached eight times and then answers,
  when the reader reads `changes`,
  then the client waited 1, 2, 4, 8, 16, 32, 60 and 60 seconds before it heard the change.
- Given a server that answers `changes` with 503 twice and then with a stream,
  when the reader reads `changes`,
  then the client waited 1 and 2 seconds before it heard the change.
- Given a server that answers `changes` with 400,
  when the reader reads,
  then the client throws `bad-answer` and opens `changes` no second time.
- Given a server that answers `send` with 503,
  when a message is sent,
  then the client throws `bad-answer` after one request and doesn't wait.
- Given a reader that heard one change,
  when it stops reading,
  then the client opens `changes` no second time.
- Given a server that answers `changes` with 401,
  when the reader reads,
  then the client throws `signed-out` and opens `changes` no second time.

## What it doesn't cover

What the server's stream sends and when it ends is `server.messaging-routes` and the poll loop's own requirement.
