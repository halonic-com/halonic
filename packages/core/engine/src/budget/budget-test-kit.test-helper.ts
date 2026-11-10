import type { RunEvent, RunParent } from "@halonicjs/events";
import type { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";

/** How a made-up run spent its money. */
export interface SpentRun {
  readonly startedAt: string;
  readonly cost: number;
  /** Set for a call the person's own subscription paid for. */
  readonly paidBy?: "subscription";
  readonly parent?: RunParent;
}

/** One model call that cost `cost`, as a run's turn log or harness writes it. */
export function pricedCall(
  runId: string,
  seq: number,
  at: string,
  cost: number,
  paidBy?: "subscription",
): RunEvent {
  return {
    runId,
    seq,
    at,
    type: "llm.response",
    agent: "writer",
    provider: "acme-ai",
    model: "acme-1",
    usage: { inputTokens: 1000, outputTokens: 200 },
    latencyMs: 400,
    text: "Dear support",
    cost,
    ...(paidBy === undefined ? {} : { paidBy }),
  };
}

/** Puts a run that started at `startedAt` and made one call into `runs`. */
export function putSpentRun(runs: KernelRuns, runId: string, spent: SpentRun): void {
  const { startedAt, cost, paidBy, parent } = spent;
  runs.logs.set(runId, [
    {
      runId,
      seq: 1,
      at: startedAt,
      type: "run.started",
      hubId: "acme",
      workflowId: "reply",
      input: {},
      kind: "run",
      definitionsVersion: "0".repeat(64),
      ...(parent === undefined ? {} : { parent }),
    },
    pricedCall(runId, 2, startedAt, cost, paidBy),
  ]);
}

/** Adds a call that cost `cost` to the end of a run's log, as its turn log would. */
export function addPricedCall(runs: KernelRuns, runId: string, cost: number): void {
  const log = runs.logs.get(runId) ?? [];
  const last = log.at(-1);
  if (last === undefined) throw new Error(`Run "${runId}" has no log.`);
  log.push(pricedCall(runId, last.seq + 1, last.at, cost));
}
