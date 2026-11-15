import { placedRoutines } from "@halonicjs/app";
import type { WebhookRoutines } from "@halonicjs/host-server";
import type { DefinitionSource } from "@halonicjs/ports";
import { routineKey } from "@halonicjs/routines";
import { loadWorkspace } from "@halonicjs/workspace";

/**
 * The routines a webhook can start, read from the snapshot the deployer
 * uploaded. The snapshot is read at every delivery, as the Node host reads its
 * routines, so the Worker holds no routine list that could go stale. A
 * routine that isn't in the snapshot is `null`, the same as one that never
 * existed: the shared webhook checks decide whether it is switched on and
 * whether the request is signed.
 *
 * @example
 * const webhooks = snapshotWebhooks(runtime.definitions);
 * await webhooks.find("acme/orders");
 */
export function snapshotWebhooks(definitions: DefinitionSource): WebhookRoutines {
  return {
    async find(key) {
      const routines = placedRoutines(await loadWorkspace(definitions));
      return routines.find((placed) => routineKey(placed) === key) ?? null;
    },
  };
}
