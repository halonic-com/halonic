import type { ScopeKey } from "@paperclipai/plugin-sdk";
import type { RunStateClient } from "./plugin-run-store.ts";

/**
 * The engine lock (HAL-17774): exactly one worker runs a company's
 * workflow engine, because the engine's start marks every `running` run
 * as interrupted and assumes no other engine shares its store (Liam,
 * HAL-17772). Plugin state has no compare-and-set, so the lock is a lease:
 * a worker writes its id with an end time, reads it back, and holds the
 * lock only if its own id came back. A worker that stops leaves a lease
 * that runs out, and the next pass after that takes it over.
 */

/** How long a lease lasts; a pass renews it each time it takes the lock. */
export const leaseMs = 5 * 60_000;

interface Lease {
  readonly owner: string;
  readonly until: number;
}

function leaseKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "workflow-engine",
    stateKey: "lease",
  };
}

function isLease(value: unknown): value is Lease {
  const lease = value as Partial<Lease> | null;
  return typeof lease?.owner === "string" && typeof lease.until === "number";
}

/** The lock of one worker, named by `owner`, a random id the worker makes when it starts. */
export interface EngineLock {
  /**
   * Runs `work` while this worker holds the company's lease, and returns
   * its result; returns `held-elsewhere` without running it when another
   * worker's lease hasn't run out. Two calls in one worker take turns.
   */
  run<T>(companyId: string, now: Date, work: () => Promise<T>): Promise<T | "held-elsewhere">;
}

/** An engine lock over plugin state for the worker `owner`. */
export function engineLock(state: RunStateClient, owner: string): EngineLock {
  const turns = new Map<string, Promise<unknown>>();
  async function take(companyId: string, now: Date): Promise<boolean> {
    const key = leaseKey(companyId);
    const current = await state.get(key);
    if (isLease(current) && current.owner !== owner && current.until > now.getTime()) {
      return false;
    }
    await state.set(key, { owner, until: now.getTime() + leaseMs });
    // Two workers that both found the lease free both wrote; the last write wins, and only its owner goes on.
    const after = await state.get(key);
    return isLease(after) && after.owner === owner;
  }
  return {
    run(companyId, now, work) {
      const step = async () => ((await take(companyId, now)) ? await work() : "held-elsewhere");
      const before = turns.get(companyId) ?? Promise.resolve();
      const result = before.then(step, step);
      turns.set(
        companyId,
        result.catch(() => {}),
      );
      return result;
    },
  };
}
