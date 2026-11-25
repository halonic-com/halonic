/**
 * The routing entry point other tooling imports (`@halonicjs/tooling-paperclip/routing`):
 * the resolver from `routing.ts`, and `routingOf`, which takes a routing only
 * from a snapshot the snapshot loader accepts (HAL-17982).
 */
import { readSnapshot } from "@halonicjs/format";
import type { Routing } from "./routing.ts";

export { areaOwnerFor, defaultRoles, personFor, type Routing } from "./routing.ts";

/**
 * The routing of a workspace snapshot, checked by the snapshot loader
 * (`readSnapshot`), or `undefined` when the snapshot is refused or has none.
 * A refused snapshot gives no routing at all, never part of one.
 *
 * @param snapshot - the snapshot as JSON data
 */
export function routingOf(snapshot: unknown): Routing | undefined {
  const read = readSnapshot(snapshot);
  return read.ok ? read.value.routing : undefined;
}
