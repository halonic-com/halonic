import { createHash, randomBytes } from "node:crypto";
import type { CloudflareApi } from "./api.ts";
import { DeployError, redact } from "./errors.ts";
import { type DeployLock, withDeployLock } from "./lock.ts";

/**
 * The Workers secret that holds the SHA-256 of the admin key in hex. The Worker reads it as
 * `admin-key-hash` (requirement `runtime.admin-key`); Cloudflare hands a secret over as `env`
 * variable of the same name, which is why the prefix is part of the name set here.
 */
export const adminKeySecretName = "HALONIC_SECRET_ADMIN_KEY_HASH";

/** How often a removal that failed is tried, the first try included. */
const removeAttempts = 3;
const removeRetryMs = 500;

export interface AdminKeyJobOptions {
  readonly accountId: string;
  readonly worker: string;
  /** What a deploy that meets the lock is shown as the holder. */
  readonly label: string;
  /** Aborted on Ctrl C: the job is no longer waited for, the secret is removed and the job fails with `deploy-aborted`. */
  readonly signal?: AbortSignal;
  /** Tests inject the key's bytes; a job never does. */
  readonly randomKey?: () => Uint8Array;
  /** Tests inject these. */
  readonly lock?: Pick<
    NonNullable<Parameters<typeof withDeployLock>[1]>,
    "id" | "now" | "schedule"
  >;
  /** Waits between tries to remove the secret. Tests inject an instant one. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `job` with a key for the Worker's `/admin/...` routes (ADR 5.6), under the deploy lock so no
 * deploy or rollback runs meanwhile: makes 32 random bytes as base64url, sets the secret to the key's
 * SHA-256 (never the key), runs the job and removes the secret when the job ends, success, failure or
 * Ctrl C. The key exists only inside `job`. Every error that leaves holds neither the key nor its hash.
 *
 * @throws DeployError `deploy-locked` when another deploy holds the lock; nothing was set
 * @throws DeployError `deploy-aborted` when `signal` aborted before or during the job
 * @throws DeployError `admin-key-left` when the secret couldn't be removed afterwards (after a few
 *   tries): the routes stay open to anyone holding the key, so the message says to remove it.
 *   The job's own error, if it had one, is its `cause`.
 */
export async function withAdminKey<T>(
  api: CloudflareApi,
  options: AdminKeyJobOptions,
  job: (key: string, lock: DeployLock) => Promise<T>,
): Promise<T> {
  const key = Buffer.from((options.randomKey ?? (() => randomBytes(32)))()).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");
  const secrets = [key, hash];
  const { accountId, worker, signal } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  try {
    return await withDeployLock(
      api,
      {
        accountId,
        worker,
        label: options.label,
        ...(signal ? { signal } : {}),
        ...options.lock,
      },
      async (lock) => {
        if (signal?.aborted) throw aborted();
        let outcome: { readonly value: T } | { readonly error: unknown };
        try {
          await api.setWorkerSecret(accountId, worker, adminKeySecretName, hash);
          outcome = { value: await untilAborted(job(key, lock), signal) };
        } catch (error) {
          outcome = { error };
        }
        const failure = await remove();
        if (failure) {
          const reason = failure instanceof Error ? failure.message : "unknown error";
          throw new DeployError(
            "admin-key-left",
            `The admin key's secret ${adminKeySecretName} is still on Worker ${worker}, so its /admin routes stay open to anyone holding the key. Remove the secret before anything else (${reason}).`,
            { cause: "error" in outcome ? outcome.error : failure },
          );
        }
        if ("error" in outcome) throw outcome.error;
        return outcome.value;
      },
    );
  } catch (error) {
    throw redactError(error, secrets);
  }

  async function remove(): Promise<unknown> {
    let failure: unknown;
    for (let attempt = 1; attempt <= removeAttempts; attempt++) {
      try {
        await api.deleteWorkerSecret(accountId, worker, adminKeySecretName);
        return undefined;
      } catch (error) {
        failure = error;
        if (attempt < removeAttempts) await sleep(removeRetryMs);
      }
    }
    return failure;
  }
}

function aborted(): DeployError {
  return new DeployError("deploy-aborted", "The job was interrupted.");
}

/** Settles with `work`, or fails with `deploy-aborted` as soon as `signal` aborts, even if `work` hangs. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * The error with every secret replaced in its message, stack and cause chain. An error that holds
 * none comes back as it is; otherwise a copy of the same class and fields.
 */
function redactError(error: unknown, secrets: readonly string[]): unknown {
  if (typeof error === "string") return redact(error, secrets);
  if (!(error instanceof Error)) {
    return error === undefined || error === null || typeof error !== "object"
      ? error
      : new Error(redact(String(error), secrets));
  }
  const message = redact(error.message, secrets);
  const stack = error.stack === undefined ? undefined : redact(error.stack, secrets);
  const cause = error.cause === undefined ? undefined : redactError(error.cause, secrets);
  if (message === error.message && stack === error.stack && cause === error.cause) return error;
  const copy = Object.create(Object.getPrototypeOf(error)) as Error;
  Object.defineProperties(copy, Object.getOwnPropertyDescriptors(error));
  Object.defineProperty(copy, "message", { value: message, writable: true, configurable: true });
  if (stack !== undefined)
    Object.defineProperty(copy, "stack", { value: stack, writable: true, configurable: true });
  if (cause !== undefined)
    Object.defineProperty(copy, "cause", { value: cause, writable: true, configurable: true });
  return copy;
}
