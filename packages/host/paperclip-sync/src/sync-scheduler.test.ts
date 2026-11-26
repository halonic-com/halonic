import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeScheduler } from "./fake-scheduler.test-helper.ts";
import { pollRates } from "./poll-rates.ts";
import { SyncScheduler, syncPollTimer } from "./sync-scheduler.ts";

/** A sync scheduler on a fake scheduler, counting polls; nothing runs until `pass`. */
async function startSync(options: { windowOpen?: boolean; waiting?: () => Promise<boolean> } = {}) {
  const scheduler = new FakeScheduler("2026-11-26T10:00:00.000Z");
  let polls = 0;
  const sync = new SyncScheduler({
    scheduler,
    clock: scheduler.clock,
    poll: async () => {
      polls += 1;
    },
    ...(options.waiting === undefined ? {} : { waiting: options.waiting }),
  });
  scheduler.listen({
    onTimer: async (timer) => void (await sync.onTimer(timer)),
    onTick: async () => {},
  });
  await sync.start(options.windowOpen ?? true);
  const dueIn = () => scheduler.dueIn(syncPollTimer.key, syncPollTimer.timerId);
  return { sync, scheduler, dueIn, polls: () => polls };
}

verifies("agent-host.paperclip-polling", () => {
  describe("the first full load", () => {
    it("polls at once on start", async () => {
      const { scheduler, polls } = await startSync();

      await scheduler.pass(0);

      expect(polls()).toBe(1);
    });
  });

  describe("poll rates by window and events", () => {
    it("with events down and a window open, the next poll is due after 10 seconds", async () => {
      const { scheduler, dueIn, polls } = await startSync();
      await scheduler.pass(0);

      expect(dueIn()).toBe(10_000);
      await scheduler.pass(9_999);
      expect(polls()).toBe(1);
      await scheduler.pass(1);
      expect(polls()).toBe(2);
    });

    it("with events down and the window closed, the next poll is due after 2 minutes", async () => {
      const { scheduler, dueIn } = await startSync({ windowOpen: false });
      await scheduler.pass(0);

      expect(dueIn()).toBe(2 * 60_000);
    });

    it("with events connected, polls every minute with a window open and every 5 minutes without", async () => {
      const { sync, scheduler, dueIn } = await startSync();
      await sync.setEvents("connected");
      await scheduler.pass(0);
      expect(dueIn()).toBe(60_000);

      await sync.setWindowOpen(false);
      await scheduler.pass(60_000);
      expect(dueIn()).toBe(5 * 60_000);
    });

    it("takes every wait from the one rate table", () => {
      expect(pollRates).toEqual({
        connected: { windowOpenMs: 60_000, windowClosedMs: 5 * 60_000 },
        down: { windowOpenMs: 10_000, windowClosedMs: 2 * 60_000 },
        whileWaitingMs: 5_000,
        waitingForMs: 3 * 60_000,
      });
    });
  });

  describe("polls at once", () => {
    it("when a window gets focus", async () => {
      const { sync, scheduler, polls } = await startSync({ windowOpen: false });
      await scheduler.pass(60_000);
      expect(polls()).toBe(1);

      await sync.setWindowOpen(true);
      await scheduler.pass(0);

      expect(polls()).toBe(2);
    });

    it("when events connect, to catch up on what they missed", async () => {
      const { sync, scheduler, polls } = await startSync();
      await scheduler.pass(5_000);
      expect(polls()).toBe(1);

      await sync.setEvents("connected");
      await scheduler.pass(0);

      expect(polls()).toBe(2);
    });

    it("when asked, as a sign-in that connects a source does", async () => {
      const { sync, scheduler, polls } = await startSync();
      await scheduler.pass(5_000);

      await sync.pollNow();
      await scheduler.pass(0);

      expect(polls()).toBe(2);
    });
  });

  it("brings the next poll forward when events go down", async () => {
    const { sync, scheduler, dueIn } = await startSync();
    await sync.setEvents("connected");
    await scheduler.pass(0);
    expect(dueIn()).toBe(60_000);

    await sync.setEvents("down");

    expect(dueIn()).toBe(10_000);
  });

  it("polls every 5 seconds after a send while a chat waits, then every 10 once none does", async () => {
    let waiting = true;
    const { sync, scheduler, polls } = await startSync({ waiting: async () => waiting });
    await scheduler.pass(0);

    await sync.expectReply();
    await scheduler.pass(5_000);
    await scheduler.pass(5_000);
    expect(polls()).toBe(3);

    waiting = false;
    await scheduler.pass(5_000);
    expect(polls()).toBe(4);
    await scheduler.pass(9_999);
    expect(polls()).toBe(4);
    await scheduler.pass(1);
    expect(polls()).toBe(5);
  });

  it("goes back to 10 seconds 3 minutes after the last send, even if the chat still waits", async () => {
    const { sync, scheduler, dueIn } = await startSync({ waiting: async () => true });
    await scheduler.pass(0);

    await sync.expectReply();
    await scheduler.pass(3 * 60_000);

    expect(dueIn()).toBe(10_000);
  });

  it("keeps the 2-minute wait with the window closed, even right after a send", async () => {
    const { sync, scheduler, dueIn } = await startSync({
      windowOpen: false,
      waiting: async () => true,
    });
    await scheduler.pass(0);

    await sync.expectReply();

    expect(dueIn()).toBe(2 * 60_000);
  });

  it("drops a late or repeated delivery and a timer that isn't the poll's", async () => {
    const { sync, scheduler, polls } = await startSync();
    await scheduler.pass(0);

    const late = await sync.onTimer({ ...syncPollTimer, at: "2026-11-26T10:00:00.000Z" });
    const other = await sync.onTimer({
      key: "run-1",
      timerId: "poll",
      at: "2026-11-26T10:00:10.000Z",
    });

    expect([late, other, polls()]).toEqual([true, false, 1]);
  });

  it("stops polling when stopped, and a later poll request starts none", async () => {
    const { sync, scheduler, dueIn, polls } = await startSync();

    await sync.stop();
    await sync.pollNow();
    await sync.setEvents("connected");
    await scheduler.pass(60_000);

    expect(polls()).toBe(0);
    expect(dueIn()).toBeUndefined();
  });
});

verifies("agent-host.paperclip-first-poll", () => {
  it("reads at once when a sign-in connects, then 10 seconds after that read", async () => {
    const { sync, scheduler, polls } = await startSync();
    await scheduler.pass(5_000);

    await sync.pollNow();
    await scheduler.pass(0);
    expect(polls()).toBe(2);
    await scheduler.pass(9_999);
    expect(polls()).toBe(2);
    await scheduler.pass(1);
    expect(polls()).toBe(3);
  });

  it("starts no read once polling has stopped", async () => {
    const { sync, scheduler, polls } = await startSync();
    await sync.stop();

    await sync.pollNow();
    await scheduler.pass(60_000);

    expect(polls()).toBe(0);
  });
});
