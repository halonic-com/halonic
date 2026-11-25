import { MemoryScheduler } from "@halonicjs/adapter-memory";
import { type MessagingFailure, MessagingHub } from "@halonicjs/host-agent-messaging-hub";
import type { MessagingId } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MessagingPoller, messagingPollTimer } from "./messaging-poller.ts";

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

/** A poller on a memory scheduler whose clock the test moves; nothing runs until `wait`. */
async function startPolling(options: { inFront?: boolean; poll?: () => Promise<void> } = {}) {
  let now = Date.parse("2026-11-24T10:00:00.000Z");
  const clock = { now: () => new Date(now) };
  let polls = 0;
  const poll =
    options.poll ??
    (async () => {
      polls += 1;
    });
  let poller: MessagingPoller | undefined;
  const scheduler = new MemoryScheduler(
    {
      onTimer: async (timer) => {
        await poller?.onTimer(timer);
      },
      onTick: async () => {},
    },
    clock,
  );
  poller = new MessagingPoller({ scheduler, clock, poll });
  await poller.start(options.inFront ?? true);
  const wait = async (ms: number) => {
    now += ms;
    await scheduler.runDue();
  };
  return { poller, scheduler, wait, polls: () => polls };
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.paperclip-polling", () => {
  it("polls every 30 seconds while the window is in front", async () => {
    const { wait, polls } = await startPolling();

    await wait(29_999);
    expect(polls()).toBe(0);
    await wait(1);
    expect(polls()).toBe(1);
    await wait(30_000);
    expect(polls()).toBe(2);
  });

  it("polls every 5 minutes while the window is in the background", async () => {
    const { wait, polls } = await startPolling({ inFront: false });

    await wait(5 * 60_000 - 1);
    expect(polls()).toBe(0);
    await wait(1);
    expect(polls()).toBe(1);
    await wait(5 * 60_000);
    expect(polls()).toBe(2);
  });

  it("polls at once when the window comes back to the front after 2 minutes", async () => {
    const { poller, wait, polls } = await startPolling({ inFront: false });
    await wait(2 * 60_000);
    expect(polls()).toBe(0);

    await poller.setInFront(true);
    await wait(0);

    expect(polls()).toBe(1);
    await wait(30_000);
    expect(polls()).toBe(2);
  });

  it("drops a late or repeated delivery and a timer that isn't the poll's", async () => {
    const { poller, wait, polls } = await startPolling();
    await wait(30_000);

    const late = await poller.onTimer({ ...messagingPollTimer, at: "2026-11-24T10:00:30.000Z" });
    const other = await poller.onTimer({
      key: "run-1",
      timerId: "poll",
      at: "2026-11-24T10:01:00.000Z",
    });

    expect([late, other, polls()]).toEqual([true, false, 1]);
  });

  it("stops polling when stopped", async () => {
    const { poller, scheduler, wait, polls } = await startPolling();

    await poller.stop();
    await wait(60_000);

    expect(polls()).toBe(0);
    expect(await scheduler.pending(messagingPollTimer.key)).toEqual([]);
  });

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
    const { wait } = await startPolling({ poll: () => hub.refresh() });

    await wait(30_000);
    await settle();
    expect(seen).toEqual([]);

    polled.onServer.push(() => polled.addInboxItem(source.id, { question: "Ship it?" }));
    await wait(30_000);
    await settle();

    expect(seen).toEqual([source.id]);
    expect(polled.refreshes).toBe(2);
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

    await hub.refresh();

    expect(working.refreshes).toBe(1);
    expect(failures).toEqual([{ provider: "acme", action: "refresh", error: down }]);
  });
});
