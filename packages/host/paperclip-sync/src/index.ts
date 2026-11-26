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
  type EventsSignal,
  type EventsSocket,
  LiveEventsKeeper,
  type LiveEventsKeeperOptions,
  type OpenEvents,
  reconnectResetAfterMs,
  reconnectWaits,
} from "./live-events-keeper.ts";
export { eventsBatchMs, LiveSync, type LiveSyncOptions } from "./live-sync.ts";
export { type EventsState, type PollRates, pollRates } from "./poll-rates.ts";
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
export {
  SyncCounters,
  type SyncCountersOptions,
  type SyncRouteCall,
  summaryLine,
  syncDiagnosticsWindowMs,
  syncLogEveryMs,
} from "./sync-counters.ts";
export type { SyncPersistence } from "./sync-persistence.ts";
export {
  SyncScheduler,
  type SyncSchedulerOptions,
  syncPollTimer,
} from "./sync-scheduler.ts";
export { SyncStore } from "./sync-store.ts";
