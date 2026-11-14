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
}

/**
 * Runs `fn` while holding the deploy lock. A second deploy gets a {@link DeployLockedError}
 * with the holder and start time. The lease renews in the background during long steps and
 * the lock is freed when `fn` ends, however it ends.
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

  const startedAt = now();
  const held = await api.takeDeployLock(options.accountId, database, {
    id,
    label: options.label,
    startedAt,
    expiresAt: startedAt + leaseMs,
  } satisfies DeployLease);
  if (held.id !== id) throw new DeployLockedError(held.label, held.startedAt, held.expiresAt);

  let lost: DeployError | undefined;
  const renew = async () => {
    if (lost) throw lost;
    if (options.signal?.aborted) return;
    if (!(await api.renewDeployLock(options.accountId, database, id, now() + leaseMs))) {
      lost = new DeployError(
        "deploy-lock-lost",
        "Another deploy took over the lock while this one was running, so this one stopped.",
      );
      throw lost;
    }
  };
  // A failed background renewal is picked up by the next `renew` or the check after `fn`.
  const stopRenewing = schedule(
    () => {
      renew().catch((error: unknown) => {
        lost ??= error instanceof DeployError ? error : toLost(error);
      });
    },
    Math.max(1, Math.floor(leaseMs / 3)),
  );

  let failure: unknown;
  try {
    const result = await fn({ renew });
    if (lost) throw lost;
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
  return new DeployError("deploy-lock-lost", `The deploy lock could not be renewed: ${reason}`);
}

function intervalSchedule(run: () => void, ms: number): () => void {
  const timer = setInterval(run, ms);
  timer.unref?.();
  return () => clearInterval(timer);
}
