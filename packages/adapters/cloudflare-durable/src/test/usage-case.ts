// Test code only: an acme usage account over the in-memory storage, with a clock a case moves.
import { UsageAccount, type UsageAccountOptions } from "../usage-account.ts";
import { UsageOutbox } from "../usage-outbox.ts";
import type { OutboxRow, UsageAmounts, UsageLimits } from "../usage-types.ts";
import { MemoryUsageStorage } from "./memory-usage-storage.ts";

export const period = { start: Date.UTC(2026, 10, 1), end: Date.UTC(2026, 11, 1) };

/** Limits for a personal scope: 1,000 of cost a period, 100 by default per step, 2 runs at once. */
export function acmeLimits(fields: Partial<UsageLimits> = {}): UsageLimits {
  return {
    version: 1,
    status: "active",
    period,
    limits: { cost: 1_000 },
    defaultReserve: { cost: 100 },
    maxRunning: 2,
    ...fields,
  };
}

/** A new account, with `limits` applied unless it's `null`, and the clock at the period's start. */
export function openAccount(
  limits: UsageLimits | null = acmeLimits(),
  options: Partial<UsageAccountOptions> = {},
) {
  const clock = { nowMs: period.start, now: () => new Date(clock.nowMs) };
  const storage = new MemoryUsageStorage();
  const account = new UsageAccount(storage, { scope: "u/acme", clock, ...options });
  if (limits !== null) account.applyLimits(limits);
  const outbox = (): OutboxRow[] => new UsageOutbox(storage, 1).rows();
  return { account, storage, clock, outbox };
}

/** A step's reservation for run `run_1` of `u_acme`, with a one-minute time limit. */
export function step(id: string, max: UsageAmounts = { cost: 300 }, actor = "u_acme") {
  return { id, runId: "run_1", actor, max, timeLimitMs: 60_000 };
}
