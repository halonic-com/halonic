import { usageLimitsKey } from "./usage-limits.ts";
import type { UsageLimits, UsageRefusal, UsageStorage } from "./usage-types.ts";

/** Where an account keeps its running runs, one key per run. */
export const runKeyPrefix = "running:";

/**
 * How long a running run holds its slot without renewing it. A run renews well within this while
 * it runs; a run that is lost (its worker died, its stop never came) frees its slot once it ends.
 */
export const defaultRunLeaseMs = 120_000;

/** A running run's slot: whose run it is, and when its lease ends unless the run renews it. */
export interface RunSlot {
  readonly actor: string;
  readonly expiresAt: number;
}

/** The slots whose lease hasn't ended at `now`. A slot past its lease counts for nothing. */
function liveSlots(storage: UsageStorage, now: number): RunSlot[] {
  return [...storage.list<RunSlot>(runKeyPrefix)]
    .map(([, slot]) => slot)
    .filter((slot) => slot.expiresAt > now);
}

/**
 * Why a run of `actor` can't start now: the scope, or the member, has as many runs running as it
 * may. Only running runs whose lease hasn't ended hold a slot; a waiting run gave its slot back.
 * Call it inside the transaction that takes the slot.
 */
export function slotRefusal(
  storage: UsageStorage,
  actor: string,
  now: number,
): UsageRefusal | null {
  const limits = storage.get<UsageLimits>(usageLimitsKey);
  if (limits === undefined) return { code: "plan.none" };
  const running = liveSlots(storage, now);
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

/**
 * Deletes every slot whose lease ended by `now`, and answers when the next one ends, or `null`
 * when no slot is held. Call it inside a transaction.
 */
export function freeExpiredSlots(storage: UsageStorage, now: number): number | null {
  let next: number | null = null;
  for (const [key, slot] of [...storage.list<RunSlot>(runKeyPrefix)]) {
    if (slot.expiresAt > now) {
      next = Math.min(next ?? slot.expiresAt, slot.expiresAt);
      continue;
    }
    storage.delete(key);
  }
  return next;
}
