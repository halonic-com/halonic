# Decision: the sync polls Paperclip by window and live events, and loads everything at start

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19201
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Y9PascWoHieAsH/2kR4Df97d8Wghhr7yfKbvmSj32+WH6ILHJqMoGiBis9ZVaOLTM6JhCpSklTggx4nOGi0NAg==

The sync service design (HAL-19201, approved by Liam) replaces the host's poller with a sync
scheduler in `packages/host/paperclip-sync`. `agent-host.paperclip-polling` said the host reads
Paperclip about every 30 seconds while Studio is in front and every 5 minutes in the background.
It now says:

- the host reads each connection at once when it starts (the first full load);
- after that it reads on one table of rates, by window and live events: with events, every minute
  with a window open and every 5 minutes without; without events (as now, until the events
  connection lands), every 10 seconds with a window open and every 2 minutes without;
- it reads at once when a window comes to the front, as before, and when live events (re)connect;
- a read that changes nothing reports nothing on `changes`.

A read without a change is now one small "changed since" read of the local copy, so polling every
10 seconds costs less than the old full read every 30. The 5-second reads while a chat waits for its
agent (HAL-19388) don't change; they end on the table's rate instead of 30 seconds.
`agent-host.paperclip-first-poll` keeps its rule; its example's "next 30 seconds after" becomes
10 seconds.

Tests: `messaging-poller.ts` is gone, and so are its two test files. Every test in them moved,
with the new waits, to `packages/host/paperclip-sync/src/sync-scheduler.test.ts` (timing and
first-poll) and `apps/agent-host/src/messaging/sync-poll.test.ts` (changes and a failing provider);
none was dropped. `team-status-tick.test.ts` now counts the first full load at start, and its
messaging read comes after 10 seconds instead of 30. Its 5-minute team status tick doesn't change.

## Covers

- agent-host.paperclip-polling
- agent-host.paperclip-first-poll
- apps/agent-host/src/messaging/messaging-poller.test.ts
- apps/agent-host/src/messaging/messaging-poller-first-poll.test.ts
- apps/agent-host/src/messaging/team-status-tick.test.ts
