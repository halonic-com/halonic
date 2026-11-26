import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { type MessagingFailure, MessagingHub } from "@halonicjs/host-agent-messaging-hub";
import { SyncScheduler } from "@halonicjs/host-paperclip-sync";
import type { MessagingId } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** A fake that, like the Paperclip provider, only sees what changed on its server when it is refreshed. */
class PolledFake extends FakeAgentMessaging {
  /** Changes made on the server since the last refresh. */
  readonly onServer: (() => void)[] = [];
  refreshes = 0;

  async refresh(): Promise<void> {
    this.refreshes += 1;
    for (const change of this.onServer.splice(0)) change();
  }
}

/** The host's sync polling `hub` on a memory scheduler whose clock the test moves. */
async function startSync(hub: MessagingHub) {
  const clock = new ManualClock("2026-11-26T10:00:00.000Z");
  let sync: SyncScheduler | undefined;
  const scheduler = new MemoryScheduler(
    { onTimer: async (timer) => void (await sync?.onTimer(timer)), onTick: async () => {} },
    clock,
  );
  sync = new SyncScheduler({ scheduler, clock, poll: () => hub.refresh() });
  await sync.start();
  return async (ms: number) => {
    clock.advance(ms);
    await scheduler.runDue();
  };
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.paperclip-polling", () => {
  it("reports a poll that found a change on changes, and says nothing after one that found none", async () => {
    const polled = new PolledFake({ idPrefix: "a" });
    const source = polled.addSource({ label: "Paperclip · Acme" });
    const failures: MessagingFailure[] = [];
    const hub = new MessagingHub({
      providers: [{ name: "acme", messaging: polled }],
      report: (failure) => failures.push(failure),
    });
    const seen: MessagingId[] = [];
    const reader = hub.changes()[Symbol.asyncIterator]();
    const read = (async () => {
      for (let next = await reader.next(); next.done !== true; next = await reader.next()) {
        seen.push(next.value);
      }
    })();
    const wait = await startSync(hub);

    await wait(0);
    await wait(10_000);
    await settle();
    expect(seen).toEqual([]);

    polled.onServer.push(() => polled.addInboxItem(source.id, { question: "Ship it?" }));
    await wait(10_000);
    await settle();

    expect(seen).toEqual([source.id]);
    expect(polled.refreshes).toBe(3);
    expect(failures).toEqual([]);
    await reader.return?.();
    await read;
  });

  it("goes on polling the other providers when one fails, and reports it", async () => {
    const working = new PolledFake({ idPrefix: "b" });
    const down = new Error("Acme is down");
    const failing = new PolledFake({ idPrefix: "a" });
    failing.refresh = () => Promise.reject(down);
    const failures: MessagingFailure[] = [];
    const hub = new MessagingHub({
      providers: [
        { name: "acme", messaging: failing },
        { name: "globex", messaging: working },
      ],
      report: (failure) => failures.push(failure),
    });
    const wait = await startSync(hub);

    await wait(0);

    expect(working.refreshes).toBe(1);
    expect(failures).toEqual([{ provider: "acme", action: "refresh", error: down }]);
  });
});
