import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { KeyAddressQueue } from "./key-address-queue.ts";

/** The open folder's questions with their state, for the feature's own dialog host. */
export const KeyAddressQueueService: ServiceKey<KeyAddressQueue> = serviceKey<KeyAddressQueue>(
  "models.key-address-queue",
);
