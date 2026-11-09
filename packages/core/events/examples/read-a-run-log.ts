import { entryOf, parseEventLine, summarize } from "../src/index.ts";

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
