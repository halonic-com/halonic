# @halonicjs/events

Run event log types and the summaries worked out from them.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/events`

Every run is an append-only stream of `RunEvent`s. The timeline, cost
reports, test assertions and replays all read that one stream. **The run log
is a user contract:** event names and fields never change. New fields are
optional and come with a requirement.

- `RunEvent`, `RunEventBody`, `RunEventType`: the events.
- `summarize(events)`: folds a run's events into a `RunSummary`. Every run
  store uses it.
- `upgradeEvent(raw)` and `parseEventLine(line)`: read stored events,
  renaming the fields of older logs (`projectId`, `flowId`).
- `entryOf(events)`: the timeline entry of each event, the `seq` of the event
  that opened it. Events keep their own `entry`; logs written before that
  field existed get the same entries worked out (requirement
  `timeline-entry-id`).

## Example

```ts
import { parseEventLine, summarize } from "@halonicjs/events";

const log =
  '{"runId":"r","seq":1,"at":"2026-11-05T07:00:00Z","type":"run.started","hubId":"p","workflowId":"f","input":{},"kind":"run","definitionsVersion":"v1"}';
const summary = summarize(log.split("\n").map(parseEventLine));
// summary?.status === "running"
```
