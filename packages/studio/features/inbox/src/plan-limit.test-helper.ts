import type { RunFailureCause, RunSummary } from "@halonicjs/events";
import { waitingRun } from "./test-runs.test-helper.ts";

/** Acme's customer's stop at a unit's limit, with `detail` set over a used-up cost limit. */
export function planStop(
  code = "plan.cost",
  detail: Readonly<Record<string, string>> = {},
): RunFailureCause {
  return {
    kind: "limit_reached",
    code,
    detail: {
      unit: "cost",
      used: "10",
      limit: "10",
      currency: "EUR",
      resetsAt: "2026-12-02T00:00:00.000Z",
      planId: "starter",
      planVersion: "1",
      planName: "Starter",
      canUpgrade: "false",
      ...detail,
    },
  };
}

/** A run waiting at `limit` since 10:40, as the engine's summary gives it, failing 7 days later. */
export function runAtLimit(
  id = "r51",
  limit: RunFailureCause = planStop(),
  fields: Partial<RunSummary> = {},
): RunSummary {
  return waitingRun(id, {
    state: "reply",
    accepts: ["continue"],
    nextTimer: "2026-11-17T10:40:00.000Z",
    limit,
    ...fields,
  });
}
