import type { CloudflareApi, DeployLease } from "./api.ts";
import { DeployError, DeployLockedError } from "./errors.ts";
import { databaseNameFor } from "./provision.ts";

/** Ten minutes: long enough for a slow step, short enough that a crashed deploy frees itself. */
export const defaultLeaseMs = 10 * 60 * 1000;

export interface WithDeployLockOptions {
  readonly accountId: string;
  /** The Worker's name; the lock lives in its database `<worker>-data`. */
  readonly worker: string;
  /** What a second deploy is shown as the holder, such as `mateo on laptop`. */
  readonly label: string;
  /** A unique id for this deploy; defaults to a random UUID. */
  readonly id?: string;
  /** How long a lease lasts without a renewal. Defaults to ten minutes. */
  readonly leaseMs?: number;
  /** The clock in milliseconds. Tests inject one; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Runs `run` every `ms` until the returned function is called. Defaults to `setInterval`. */
  readonly schedule?: (run: () => void, ms: number) => () => void;
  /** Aborted on Ctrl C. The lock stops renewing; `fn` should stop and throw, and the lock is freed. */
  readonly signal?: AbortSignal;
}

/** What `fn` gets while it holds the lock. */
export interface DeployLock {
  /** Extends the lease. Call it at each step. Throws `deploy-lock-lost` if another deploy took over. */
  renew(): Promise<void>;
  /**
   * Renews the lease and marks the point of no return: call it right before the step that changes
   * what users see. Throws `deploy-lock-lost` if the lock is gone, while stopping is still safe.
   * A loss after this no longer fails the run; read it with {@link lostAfterCommit}.
   */
  commit(): Promise<void>;
  /** Checks the lease once more and returns the loss after `commit`, if any. Else undefined. */
  lostAfterCommit(): Promise<DeployError | undefined>;
}

/**
 * Runs `fn` while holding the deploy lock. A second deploy gets a {@link DeployLockedError}
 * with the holder and start time. The lease renews in the background during long steps and
 * the lock is freed when `fn` ends, however it ends. A loss found after `fn` returns fails the
 * run only if `fn` never committed; once it has, the work is done and the loss is `fn`'s to report.
 */
export async function withDeployLock<T>(
  api: CloudflareApi,
  options: WithDeployLockOptions,
  fn: (lock: DeployLock) => Promise<T>,
): Promise<T> {
  const now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? defaultLeaseMs;
  const schedule = options.schedule ?? intervalSchedule;
  const database = databaseNameFor(options.worker);
  const id = options.id ?? crypto.randomUUID();

  const requestedAt = now();
  const held = await api.takeDeployLock(options.accountId, database, {
    id,
    label: options.label,
    leaseMs,
  });
  if (held.id !== id) throw new DeployLockedError(held.label, held.startedAt, held.expiresAt);

  // The database's clock sets the lease; ours only measures how long ago it was confirmed. The
  // request went out before the lease was set, so counting from then never overstates it.
  let confirmedUntil = requestedAt + leaseMs;
  let lost: DeployError | undefined;
  let committed = false;
  const renew = async () => {
    if (lost) throw lost;
    if (options.signal?.aborted) return;
    const sentAt = now();
    let lease: DeployLease | undefined;
    try {
      lease = await api.renewDeployLock(options.accountId, database, id, leaseMs);
    } catch (error) {
      // A failed call says nothing about who holds the lock. The lease is still ours until the
      // last confirmed expiry, and the next renewal tries again.
      if (now() < confirmedUntil) return;
      lost = toLost(error);
      throw lost;
    }
    if (!lease) {
      lost = new DeployError(
        "deploy-lock-lost",
        "Another deploy took over the lock while this one was running, so this one stopped.",
      );
      throw lost;
    }
    confirmedUntil = Math.max(confirmedUntil, sentAt + leaseMs);
  };
  // A lost lease is picked up by the next `renew` or the check after `fn`.
  const stopRenewing = schedule(
    () => {
      renew().catch(() => {});
    },
    Math.max(1, Math.floor(leaseMs / 3)),
  );

  let failure: unknown;
  try {
    const result = await fn({
      renew,
      commit: async () => {
        await renew();
        committed = true;
      },
      lostAfterCommit: async () => {
        if (!committed) return undefined;
        await renew().catch(() => {});
        return lost;
      },
    });
    if (lost && !committed) throw lost;
    return result;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    stopRenewing();
    // If the release fails the lease runs out on its own. Don't hide the deploy's own error behind it.
    await api.releaseDeployLock(options.accountId, database, id).catch((error: unknown) => {
      if (failure === undefined) throw error;
    });
  }
}

function toLost(error: unknown): DeployError {
  const reason = error instanceof Error ? error.message : "unknown error";
  return new DeployError(
    "deploy-lock-lost",
    `The deploy lock could not be renewed before it ran out: ${reason}`,
  );
}

function intervalSchedule(run: () => void, ms: number): () => void {
  const timer = setInterval(run, ms);
  timer.unref?.();
  return () => clearInterval(timer);
}
