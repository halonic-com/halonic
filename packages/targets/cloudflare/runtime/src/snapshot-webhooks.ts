import { readRoutineIndex } from "@halonicjs/adapter-cloudflare-storage";
import type { WebhookRoutines } from "@halonicjs/host-server";
import type { DefinitionSource } from "@halonicjs/ports";
import { routineKey } from "@halonicjs/routines";

/**
 * The routines a webhook can start, read from the routine index of the
 * snapshot the deployer uploaded. The index is read at every delivery, as the
 * Node host reads its routines, so the Worker holds no routine list that could
 * go stale. It holds no YAML parser either: `halonic deploy` read the routine
 * files and wrote the index. A routine that isn't in the snapshot is `null`,
 * the same as one that never existed: the shared webhook checks decide whether
 * it is switched on and whether the request is signed.
 *
 * @example
 * const webhooks = snapshotWebhooks(runtime.definitions);
 * await webhooks.find("acme/orders");
 */
export function snapshotWebhooks(definitions: DefinitionSource): WebhookRoutines {
  return {
    async find(key) {
      const routines = await readRoutineIndex(definitions);
      return routines.find((placed) => routineKey(placed) === key) ?? null;
    },
  };
}
