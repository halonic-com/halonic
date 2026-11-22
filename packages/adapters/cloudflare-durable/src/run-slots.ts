import { usageLimitsKey } from "./usage-limits.ts";
import type { UsageLimits, UsageRefusal, UsageStorage } from "./usage-types.ts";

/** Where an account keeps its running runs, one key per run. */
export const runKeyPrefix = "running:";

/**
 * Why a run of `actor` can't start now: the scope, or the member, has as many runs running as it
 * may. Only running runs hold a slot; a waiting run gave its slot back. Call it inside the
 * transaction that takes the slot.
 */
export function slotRefusal(storage: UsageStorage, actor: string): UsageRefusal | null {
  const limits = storage.get<UsageLimits>(usageLimitsKey);
  if (limits === undefined) return { code: "plan.none" };
  const running = [...storage.list<{ actor: string }>(runKeyPrefix)].map(([, run]) => run);
  if (running.length >= limits.maxRunning) {
    return { code: "plan.concurrency", running: running.length, limit: limits.maxRunning };
  }
  const memberLimit = limits.members?.[actor]?.maxRunning;
  const mine = running.filter((run) => run.actor === actor).length;
  if (memberLimit !== undefined && mine >= memberLimit) {
    return { code: "plan.member.concurrency", running: mine, limit: memberLimit };
  }
  return null;
}
