# @halonicjs/host-paperclip-sync

The engine's local copy of a messaging provider's lists (requirement `agent-host.paperclip-sync`).
A provider hands over its `MessagingSync` collections, already in `AgentMessaging`'s types; the
`SyncStore` keeps them in memory and saves them through a `SyncPersistence` the host provides, and
`StoredAgentMessaging` answers agents, conversations, inbox items and work from the store. Writes,
messages and search still go to the provider. Web-standard APIs only.

`SyncScheduler` decides when the sync polls. `SyncCounters` counts every change the store applies
by how it arrived (event, poll, catch-up or write), with lags, reconnects, time per connection and
each provider route's timing, over 24 hours in memory: counts and timings only, never a title, a
body or an ID (requirement `agent-host.sync-diagnostics`). The agent host answers them at
`GET /v1/sync/diagnostics`.

`LiveSync` keeps each source's live events socket open through a `LiveEventsKeeper` (reconnect after
1, 2, 4 … 60 seconds with full jitter, none after a refusal until a new key), brings a read 300 ms
after an event that touches the local copy, and tells `SyncScheduler` and `SyncCounters` whether
events reach the engine (requirement `agent-host.paperclip-live-events`). The provider opens the
socket and cuts each event down to an `EventsSignal`; no event's content reaches this package.
Just before that read starts, `onEvents` hears which sources' events touched their copy, so the host
can tell Studio at once rather than after a read that can take seconds
(`agent-host.paperclip-event-notice`), at most once a second per source (`EventNotice`).

- **Layer:** host
- **Owner:** tomas
- **Public API:** `@halonicjs/host-paperclip-sync`

## Example

```ts
const served = new StoredAgentMessaging({
  live: provider,
  sync: provider.sync(),
  source: "paperclip:acme",
  persistence,
  warn: log,
});
await served.refresh(); // reads the source once
await served.listInboxItems(); // answered from the store, no request
```
