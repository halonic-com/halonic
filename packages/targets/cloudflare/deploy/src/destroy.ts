import type { CloudflareApi, ResourceRef } from "./api.ts";
import { DeployError, DeployLockedError } from "./errors.ts";
import { resourcesFor } from "./provision.ts";

/** One line of the destroy plan. */
export interface DestroyStep {
  readonly kind: ResourceRef["kind"];
  readonly name: string;
  /** `skip` when it is already gone. */
  readonly action: "delete" | "skip";
}

export interface DestroyOptions {
  readonly accountId: string;
  readonly worker: string;
  readonly label: string;
  /**
   * Called with what would be deleted, before anything is. Return false to stop. The CLI asks
   * the user here and suggests an export first.
   */
  readonly confirm: (steps: readonly DestroyStep[]) => Promise<boolean>;
  /** Lists what would be deleted and changes nothing: no lock, no question. */
  readonly plan?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: {
    readonly step: "deleted";
    readonly kind: string;
    readonly name: string;
  }) => void;
  readonly leaseMs?: number;
  /** Tests inject this; defaults to a random UUID. */
  readonly id?: string;
}

export interface DestroyResult {
  readonly mode: "plan" | "destroyed" | "cancelled";
  readonly steps: readonly DestroyStep[];
}

/** Looks each resource up. Refuses, before anything is deleted, if one exists that isn't marked as ours. */
async function planSteps(
  api: CloudflareApi,
  accountId: string,
  refs: readonly ResourceRef[],
): Promise<DestroyStep[]> {
  const steps: DestroyStep[] = [];
  const unmarked: ResourceRef[] = [];
  for (const ref of refs) {
    const found = await api.findResource(accountId, ref);
    if (!found) steps.push({ kind: ref.kind, name: ref.name, action: "skip" });
    else if (found.marked) steps.push({ kind: ref.kind, name: ref.name, action: "delete" });
    else unmarked.push(ref);
  }
  if (unmarked.length > 0) {
    throw new DeployError(
      "destroy-refused",
      `Halonic didn't create ${unmarked.map((r) => `${r.kind} ${r.name}`).join(", ")}, so it won't delete ${unmarked.length === 1 ? "it" : "them"}. Nothing was deleted.`,
    );
  }
  return steps;
}

/** Deletes the steps in order while renewing the lock, which lives in the database and goes with it. */
async function deleteSteps(
  api: CloudflareApi,
  options: DestroyOptions,
  refs: readonly ResourceRef[],
  steps: readonly DestroyStep[],
  lock: { readonly database: string; readonly id: string; readonly leaseMs: number } | undefined,
): Promise<void> {
  for (const step of steps) {
    const ref = refs.find((r) => r.kind === step.kind);
    if (step.action !== "delete" || !ref) continue;
    if (options.signal?.aborted) {
      throw new DeployError("deploy-aborted", "The destroy was interrupted.");
    }
    if (lock && step.kind !== "database") {
      const lease = await api.renewDeployLock(
        options.accountId,
        lock.database,
        lock.id,
        lock.leaseMs,
      );
      if (!lease) {
        throw new DeployError(
          "deploy-lock-lost",
          "Another deploy took over the lock, so the destroy stopped.",
        );
      }
    }
    await api.deleteResource(options.accountId, ref);
    options.onProgress?.({ step: "deleted", kind: step.kind, name: step.name });
  }
}

/**
 * Removes what a deploy created: the Worker first (so it stops serving), then the bucket, then
 * the database, because the bucket's marker lives in the database. It deletes only resources
 * marked as Halonic's and refuses everything else before deleting anything. It holds the
 * deploy lock while it works, so it never runs under a deploy. Running it again after a failure
 * finishes the job.
 *
 * @throws DeployError `destroy-refused` when a resource exists but isn't marked as ours
 * @throws DeployError `destroy-changed` when a resource appeared or went away while the user confirmed
 * @throws DeployError `bucket-not-empty` when the bucket still holds files
 */
export async function destroy(api: CloudflareApi, options: DestroyOptions): Promise<DestroyResult> {
  const { accountId } = options;
  const refs = [...resourcesFor(options.worker)].reverse();
  const steps = await planSteps(api, accountId, refs);
  if (options.plan) return { mode: "plan", steps };
  if (!steps.some((s) => s.action === "delete")) return { mode: "destroyed", steps };
  if (!(await options.confirm(steps))) return { mode: "cancelled", steps };

  const database = steps.find((s) => s.kind === "database" && s.action === "delete");
  if (!database) {
    await deleteSteps(api, options, refs, steps, undefined);
    return { mode: "destroyed", steps };
  }
  const lock = {
    database: database.name,
    id: options.id ?? crypto.randomUUID(),
    leaseMs: options.leaseMs ?? 10 * 60 * 1000,
  };
  const held = await api.takeDeployLock(accountId, lock.database, {
    id: lock.id,
    label: options.label,
    leaseMs: lock.leaseMs,
  });
  if (held.id !== lock.id) throw new DeployLockedError(held.label, held.startedAt, held.expiresAt);
  try {
    // A deploy may have finished while the user was at the prompt. Look again, now that nothing can
    // change, and delete only what the user was shown.
    const now = await planSteps(api, accountId, refs);
    if (now.some((step, i) => step.action !== steps[i]?.action)) {
      throw new DeployError(
        "destroy-changed",
        "What exists changed while you were confirming, so nothing was deleted. Run destroy again to see the new list.",
      );
    }
    await deleteSteps(api, options, refs, steps, lock);
  } catch (error) {
    // If the database is gone so is the lock; if not, free it. Don't hide the real error.
    await api.releaseDeployLock(accountId, lock.database, lock.id).catch(() => {});
    throw error;
  }
  return { mode: "destroyed", steps };
}
