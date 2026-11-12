import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { minutesLater } from "../summary.test-helper.ts";

/**
 * The log of an Acme Support reply run from event bodies, each with the
 * minute after 10:40 it happened at; `run.started` comes first, at 10:40.
 */
export function logOf(
  runId: string,
  timed: readonly (readonly [number, RunEventBody])[],
): RunEvent[] {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "support-reply",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
  return [[0, started] as const, ...timed].map(([minutes, body], index) => ({
    ...body,
    runId,
    seq: index + 1,
    at: minutesLater(minutes),
  }));
}

export const entered = (state: string): RunEventBody => ({ type: "state.entered", state });
