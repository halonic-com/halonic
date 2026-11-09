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
- Model fallback: `llm.skipped` says a model alias was skipped before any call
  and which alias comes next (`ModelSkipReason`, requirement `llm-skipped`).
  `llm.response.toolCallAsText` marks an answer that wrote a tool call as text
  instead of making it (requirement `tool-call-as-text`). `RunFailureReason`
  also names `model-missing` and `model-no-tools`.
- `summarize(events)`: folds a run's events into a `RunSummary`. Every run
  store uses it.
- `upgradeEvent(raw)` and `parseEventLine(line)`: read stored events,
  renaming the fields of older logs (`projectId`, `flowId`).
- `entryOf(events)`: the timeline entry of each event, the `seq` of the event
  that opened it. Events keep their own `entry`; logs written before that
  field existed get the same entries worked out (requirement
  `timeline-entry-id`).
- `sandboxOpenedView(profile, options)`: the display copy of a sandbox
  profile that a `sandbox.opened` event carries. It copies a fixed list of
  fields, never `env`, logs denied paths as group codes plus the paths the
  person added, and shortens home paths to `~` (requirement `sandbox-opened`).

## Example

Reading an old run log, summarizing it and finding its timeline entries. The code lives in
[`examples/read-a-run-log.ts`](examples/read-a-run-log.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/events` as below.

```ts
import { entryOf, parseEventLine, summarize } from "@halonicjs/events";

/** Reads a JSON-lines run log written by an older version, then summarizes it and finds its timeline entries. */
export function runExample(): {
  workflowId: string | undefined;
  status: string | undefined;
  state: string | null | undefined;
  statesVisited: string[] | undefined;
  lastSeq: number | undefined;
  entries: number[];
} {
  // A stored log: one JSON event per line. This one is from before workflows and hubs got their
  // names, so `run.started` still says `flowId` and `projectId`.
  const log = [
    '{"runId":"r1","seq":1,"at":"2026-11-05T07:00:00Z","type":"run.started","projectId":"support","flowId":"triage","input":{},"kind":"run","definitionsVersion":"v1"}',
    '{"runId":"r1","seq":2,"at":"2026-11-05T07:00:01Z","type":"state.entered","state":"classify"}',
    '{"runId":"r1","seq":3,"at":"2026-11-05T07:00:01Z","type":"agent.started","state":"classify","agent":"triager","prompt":"Sort the ticket"}',
    '{"runId":"r1","seq":4,"at":"2026-11-05T07:00:04Z","type":"agent.finished","state":"classify","agent":"triager","output":"billing"}',
  ].join("\n");

  // `parseEventLine` reads one line and gives it today's field names.
  const events = log.split("\n").map(parseEventLine);

  // `summarize` folds the events into the run's status. It gives `undefined` for an empty log.
  const summary = summarize(events);

  return {
    workflowId: summary?.workflowId, // "triage", read from the old `flowId`
    status: summary?.status, // "running": the run has not completed
    state: summary?.state, // "classify"
    statesVisited: summary?.statesVisited, // ["classify"]
    lastSeq: summary?.lastSeq, // 4
    // `agent.finished` closes the entry that `agent.started` (seq 3) opened.
    entries: entryOf(events), // [1, 2, 3, 3]
  };
}
```
