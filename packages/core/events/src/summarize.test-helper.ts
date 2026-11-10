import type { RunEvent, RunEventBody } from "./run-event.ts";
import { summarize } from "./summarize.ts";

export const startedAt = "2026-11-05T07:00:00.000Z";
export const started: Extract<RunEventBody, { type: "run.started" }> = {
  type: "run.started",
  hubId: "p",
  workflowId: "f",
  input: { q: "hi" },
  kind: "run",
  definitionsVersion: "v1",
};

/** A run log of run "r": `run.started` first, then the given bodies, numbered from 2. */
export function runLog(...bodies: RunEventBody[]): RunEvent[] {
  return [started, ...bodies].map((body, index) => ({
    runId: "r",
    seq: index + 1,
    at: index === 0 ? startedAt : `T${index + 1}`,
    ...body,
  }));
}

export function summaryOf(...bodies: RunEventBody[]) {
  const summary = summarize(runLog(...bodies));
  if (summary === null) throw new Error("expected a summary");
  return summary;
}
