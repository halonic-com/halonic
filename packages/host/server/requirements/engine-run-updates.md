# server.engine-run-updates

- Status: active
- Since: unreleased
- Source: HAL-14230; B1 design note D3 on HAL-14206 (revision 3); frame shape in `engine-api.ts` (HAL-14217)

Where the engine role serves `GET /api/run-updates`, it shall answer a server-sent event stream with one `changed` event for every run summary change the engine's `runUpdates` feed gives, from the moment the client connects. Each event's data shall hold only `runId`, `status` and `seq`, whatever else the feed's object carries. The stream shall have no event id, no `Last-Event-ID` resume and no replay: a client reads all runs again when it connects. The server shall stop following the feed when the client goes away. When 256 events wait for a client that doesn't read, the stream shall end instead of holding more.

Rationale: the page only needs to know which run to read again; step data, input and output go through the run routes. A stalled client must not make the engine hold memory without bound.

## Examples

- Given a connected client, when a run's status changes to `running` at event 4, then it receives `event: changed` with `{"runId":"run_1","status":"running","seq":4}`.
- Given a client that closes the stream, then the feed has no listener left.
- Given 300 changes and a client that reads nothing, then the stream holds 256 events, ends, and the feed has no listener left.
