import { placedRoutines } from "@halonicjs/app";
import type { WebhookRoutines } from "@halonicjs/host-server";
import type { DefinitionSource } from "@halonicjs/ports";
import { routineKey } from "@halonicjs/routines";
import { loadWorkspace } from "@halonicjs/workspace";

type Routines = ReturnType<typeof placedRoutines>;

/**
 * The routines of the newest snapshot this isolate has read, one entry per
 * snapshot location. A request makes a new definition source, so the cache
 * lives here and not on the source. It is keyed by the snapshot version, so a
 * deploy replaces the entry at the next delivery.
 */
const routinesByLocation = new Map<string, { version: string; routines: Routines }>();

/** Reads the routines of the current snapshot, loading the workspace only when its version is new to this isolate. */
async function currentRoutines(definitions: DefinitionSource): Promise<Routines> {
  const version = await definitions.version();
  const cached = routinesByLocation.get(definitions.location);
  if (cached?.version === version) {
    return cached.routines;
  }
  const routines = placedRoutines(await loadWorkspace(definitions));
  routinesByLocation.set(definitions.location, { version, routines });
  return routines;
}

/**
 * The routines a webhook can start, read from the snapshot the deployer
 * uploaded. Parsing the whole snapshot costs an R2 read per file, and an
 * unsigned request pays it too, so the parsed routines are kept per isolate
 * and per snapshot version: a delivery reads the version, and parses the
 * snapshot only when a deploy has changed it. The Worker therefore holds a
 * routine list, but one that can't be older than the snapshot's current
 * version. A routine that isn't in the snapshot is `null`, the same as one
 * that never existed: the shared webhook checks decide whether it is
 * switched on and whether the request is signed.
 *
 * @example
 * const webhooks = snapshotWebhooks(runtime.definitions);
 * await webhooks.find("acme/orders");
 */
export function snapshotWebhooks(definitions: DefinitionSource): WebhookRoutines {
  return {
    async find(key) {
      const routines = await currentRoutines(definitions);
      return routines.find((placed) => routineKey(placed) === key) ?? null;
    },
  };
}
