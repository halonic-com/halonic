/**
 * Turns Paperclip's cost rows into 10-minute `AgentUsage` buckets, each on
 * the seat the agent was on when the row was made. No I/O here: the read job
 * loads the rows and placements and stores what this returns.
 */

import type { AgentId, AgentUsage, Placement, SeatId } from "./records.ts";

/** One `cost_events` row, in the plugin's words. */
export interface CostRow {
  readonly agentId: AgentId;
  readonly runId: string;
  readonly model: string;
  /** When the cost was recorded (the end of the run), as an ISO time. */
  readonly occurredAt: string;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
}

export const bucketMs = 10 * 60_000;

/** The start of the 10-minute bucket that holds `at`, as an ISO time. */
export function bucketStart(at: string): string {
  const ms = Date.parse(at);
  return new Date(ms - (ms % bucketMs)).toISOString();
}

/** The seat `agentId` was on at `at`: the placement whose `[from, to)` holds it. */
export function seatAt(
  placements: readonly Placement[],
  agentId: AgentId,
  at: string,
): SeatId | undefined {
  const atMs = Date.parse(at);
  const holding = placements.find(
    (placement) =>
      placement.agentId === agentId &&
      Date.parse(placement.from) <= atMs &&
      (placement.to === undefined || atMs < Date.parse(placement.to)),
  );
  return holding?.seatId;
}

interface Bucket {
  usage: AgentUsage;
  readonly runIds: Set<string>;
}

/**
 * Sums `rows` per (agent, seat, model, bucket). `runs` counts the distinct
 * runs in a bucket. The result is sorted by bucket, then agent, seat and model,
 * so the same rows always give the same list.
 */
export function usageBuckets(
  rows: readonly CostRow[],
  placements: readonly Placement[],
): AgentUsage[] {
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const seatId = seatAt(placements, row.agentId, row.occurredAt);
    const start = bucketStart(row.occurredAt);
    const key = JSON.stringify([start, row.agentId, seatId ?? "", row.model]);
    const bucket = buckets.get(key) ?? {
      usage: {
        agentId: row.agentId,
        seatId,
        model: row.model,
        bucketStart: start,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        runs: 0,
      },
      runIds: new Set<string>(),
    };
    bucket.runIds.add(row.runId);
    bucket.usage = {
      ...bucket.usage,
      inputTokens: bucket.usage.inputTokens + row.inputTokens,
      cachedInputTokens: bucket.usage.cachedInputTokens + row.cachedInputTokens,
      outputTokens: bucket.usage.outputTokens + row.outputTokens,
      runs: bucket.runIds.size,
    };
    buckets.set(key, bucket);
  }
  // The keys start with the bucket's ISO time, which sorts as text.
  const keys = [...buckets.keys()].sort();
  return keys.flatMap((key) => {
    const bucket = buckets.get(key);
    return bucket === undefined ? [] : [bucket.usage];
  });
}
