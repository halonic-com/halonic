import type { RunEvent, RunKind } from "@halonicjs/events";

/** What a test run starts with; every field has a default. */
export interface StartedFields {
  hubId?: string;
  workflowId?: string;
  kind?: RunKind;
  at?: string;
}

/** The time of event `seq` in a test log: one second apart, from `start`. */
export function eventTime(seq: number, start = "2026-01-01T00:00:00.000Z"): string {
  return new Date(Date.parse(start) + seq * 1000).toISOString();
}

/** A `run.started` event, seq 1. */
export function started(runId: string, fields: StartedFields = {}): RunEvent {
  return {
    runId,
    seq: 1,
    at: fields.at ?? eventTime(1),
    type: "run.started",
    hubId: fields.hubId ?? "hub",
    workflowId: fields.workflowId ?? "flow",
    input: {},
    kind: fields.kind ?? "run",
    definitionsVersion: "v1",
  };
}

/** A `state.entered` event. */
export function entered(runId: string, seq: number, state = `s${seq}`): RunEvent {
  return { runId, seq, at: eventTime(seq), type: "state.entered", state };
}

/** A `run.completed` event with the given context. */
export function completed(
  runId: string,
  seq: number,
  context: Record<string, unknown> = {},
): RunEvent {
  return { runId, seq, at: eventTime(seq), type: "run.completed", state: "done", context };
}

/** A `run.waiting` event that waits for `approve`. */
export function waiting(runId: string, seq: number): RunEvent {
  return {
    runId,
    seq,
    at: eventTime(seq),
    type: "run.waiting",
    state: "wait",
    events: ["approve"],
  };
}

/** A `run.failed` event. */
export function failed(runId: string, seq: number, error = "boom"): RunEvent {
  return { runId, seq, at: eventTime(seq), type: "run.failed", state: null, error };
}
