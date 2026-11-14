import type { CloudflareApi, ResourceKind, ResourceRef } from "./api.ts";
import { UnmarkedResourcesError } from "./errors.ts";

/** What a deploy does with one resource. */
export type ProvisionAction = "create" | "use" | "adopt";

/** One line of the provision plan. A worker's "create" happens in the upload. */
export interface ProvisionStep {
  readonly kind: ResourceKind;
  readonly name: string;
  readonly action: ProvisionAction;
}

export interface ProvisionOptions {
  readonly accountId: string;
  /** The Worker's name; the database is `<worker>-data` and the bucket `<worker>-blobs`. */
  readonly worker: string;
  /** Allows a deploy to use resources Halonic didn't create. Off by default. */
  readonly adopt?: boolean;
  /** Lists what would happen and changes nothing. */
  readonly plan?: boolean;
}

/** The resources a deploy of `worker` needs, in the order they are made. */
export function resourcesFor(worker: string): readonly ResourceRef[] {
  // Names end up in SQL for the marker table, so only plain Worker names pass.
  if (!/^[a-z0-9][a-z0-9-]{0,52}$/.test(worker))
    throw new RangeError(`not a Worker name: ${worker}`);
  const database = `${worker}-data`;
  return [
    { kind: "database", name: database },
    { kind: "bucket", name: `${worker}-blobs`, markedIn: database },
    { kind: "worker", name: worker },
  ];
}

/**
 * Finds the Worker, database and bucket by name and makes the missing ones. Anything that
 * exists but isn't marked as ours stops the deploy, unless `adopt` is set. In `plan` mode it
 * only reads.
 */
export async function provision(
  api: CloudflareApi,
  options: ProvisionOptions,
): Promise<readonly ProvisionStep[]> {
  const found = await classify(api, options);
  if (!options.plan) {
    for (const { ref, action } of found) {
      // The upload makes the worker and tags it, so only a database or bucket is touched here.
      if (ref.kind === "worker" || action === "use") continue;
      if (action === "create") await api.createResource(options.accountId, ref);
      else await api.adoptResource(options.accountId, ref);
    }
  }
  return found.map(({ ref, action }) => ({ kind: ref.kind, name: ref.name, action }));
}

/** Looks every resource up and says what a deploy would do with it. Reads only. */
async function classify(
  api: CloudflareApi,
  options: ProvisionOptions,
): Promise<readonly { ref: ResourceRef; action: ProvisionAction }[]> {
  const found: { ref: ResourceRef; action: ProvisionAction }[] = [];
  const unmarked: ResourceRef[] = [];
  for (const ref of resourcesFor(options.worker)) {
    const existing = await api.findResource(options.accountId, ref);
    if (!existing) found.push({ ref, action: "create" });
    else if (existing.marked) found.push({ ref, action: "use" });
    else if (options.adopt) found.push({ ref, action: "adopt" });
    else unmarked.push(ref);
  }
  if (unmarked.length > 0)
    throw new UnmarkedResourcesError(unmarked.map(({ kind, name }) => ({ kind, name })));
  return found;
}
