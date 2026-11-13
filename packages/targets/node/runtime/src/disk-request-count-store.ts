import { NodeCoordination, randomLeaseToken } from "@halonicjs/adapter-coordination-node";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import type { Clock } from "@halonicjs/ports";
import {
  CoordinationRequestCountStore,
  type DailyRequestCounter,
} from "./coordination-request-count-store.ts";

/**
 * A request count kept in a folder on disk, so a restart of `halonic serve`
 * doesn't reset the day's count.
 *
 * @param folder - where the count is kept, such as a folder in the profile; created on the first request
 */
export function openDiskRequestCountStore(folder: string, clock: Clock): DailyRequestCounter {
  const coordination = new NodeCoordination({
    store: new FileRecordStore(folder),
    clock,
    newToken: randomLeaseToken,
  });
  return new CoordinationRequestCountStore(coordination);
}
