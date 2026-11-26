/**
 * Public entry point of `@halonicjs/host-paperclip-sync`: the engine's local copy of a messaging
 * provider's lists, and the `AgentMessaging` that answers reads from it.
 */
export {
  KeptCollection,
  type KeptCollectionOptions,
  keptItemsMax,
} from "./kept-collection.ts";
export {
  StoredAgentMessaging,
  type StoredAgentMessagingOptions,
} from "./stored-agent-messaging.ts";
export {
  readStored,
  type StoredCollection,
  type StoredRead,
  storeFormat,
} from "./stored-collection.ts";
export type { SyncPersistence } from "./sync-persistence.ts";
export { SyncStore } from "./sync-store.ts";
