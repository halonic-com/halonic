import { createHash, randomBytes } from "node:crypto";
import type { CloudflareApi } from "./api.ts";
import { DeployError, redact } from "./errors.ts";

/**
 * The Workers secret that holds the SHA-256 of the admin key in hex. The Worker reads it as
 * `admin-key-hash` (requirement `runtime.admin-key`); Cloudflare hands a secret over as `env`
 * variable of the same name, which is why the prefix is part of the name set here.
 */
export const adminKeySecretName = "HALONIC_SECRET_ADMIN_KEY_HASH";

export interface AdminKeyJobOptions {
  readonly accountId: string;
  readonly worker: string;
  /** Tests inject the key's bytes; a job never does. */
  readonly randomKey?: () => Uint8Array;
}

/**
 * Runs `job` with a key for the Worker's `/admin/...` routes (ADR 5.6): makes 32 random bytes as base64url, sets
 * the secret to the key's SHA-256 (never the key), runs the job and removes the secret when the job ends,
 * success or failure. The key exists only inside `job`.
 *
 * @throws DeployError `admin-key-left` when the secret couldn't be removed afterwards: the routes stay
 *   open to anyone holding the key, so the message says to remove it. The job's own error is its `cause`.
 */
export async function withAdminKey<T>(
  api: CloudflareApi,
  options: AdminKeyJobOptions,
  job: (key: string) => Promise<T>,
): Promise<T> {
  const key = Buffer.from((options.randomKey ?? (() => randomBytes(32)))()).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");
  const { accountId, worker } = options;
  let outcome: { readonly value: T } | { readonly error: unknown };
  try {
    await api.setWorkerSecret(accountId, worker, adminKeySecretName, hash);
    outcome = { value: await job(key) };
  } catch (error) {
    outcome = { error };
  }
  try {
    await api.deleteWorkerSecret(accountId, worker, adminKeySecretName);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "unknown error";
    throw new DeployError(
      "admin-key-left",
      redact(
        `The admin key's secret ${adminKeySecretName} is still on Worker ${worker}, so its /admin routes stay open to anyone holding the key. Remove the secret before anything else (${reason}).`,
        [key, hash],
      ),
      { cause: "error" in outcome ? outcome.error : cause },
    );
  }
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}
