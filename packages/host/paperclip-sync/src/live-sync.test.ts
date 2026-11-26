import type { SyncSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeScheduler } from "./fake-scheduler.test-helper.ts";
import type { EventsSignal, OpenEvents } from "./live-events-keeper.ts";
import { combinedState, LiveSync, liveSyncTimers } from "./live-sync.ts";
import { SyncScheduler, syncPollTimer } from "./sync-scheduler.ts";

/** A source's sockets as the test drives them: each attempt is one socket it can speak for. */
class FakeEvents {
  readonly sockets: { say: (signal: EventsSignal) => Promise<void>; closed: boolean }[] = [];

  readonly open: OpenEvents = (onSignal) => {
    const socket = {
      closed: false,
      say: async (signal: EventsSignal) => {
        onSignal(signal);
        await settle();
      },
      close: () => {
        socket.closed = true;
      },
    };
    this.sockets.push(socket);
    return socket;
  };

  /** The newest socket; it exists once the first attempt was made. */
  get current() {
    const socket = this.sockets.at(-1);
    if (socket === undefined) throw new Error("No socket was opened.");
    return socket;
  }
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The sync and its live events on a fake scheduler, with the first full load done. */
async function startLive(random = () => 0.5) {
  const scheduler = new FakeScheduler("2026-11-26T10:00:00.000Z");
  let polls = 0;
  const applied: SyncSource[] = [];
  const connections: string[] = [];
  const counters = { applied: (source: SyncSource) => void applied.push(source) };
  const errors: unknown[] = [];
  let live: LiveSync | undefined;
  const sync = new SyncScheduler({
    scheduler,
    clock: scheduler.clock,
    poll: () =>
      (live as LiveSync).poll(async () => {
        polls += 1;
      }),
  });
  live = new LiveSync({
    scheduler,
    clock: scheduler.clock,
    sync,
    counters: { setConnection: (state) => void connections.push(state) },
    report: (error) => void errors.push(error),
    random,
  });
  scheduler.listen({
    onTimer: async (timer) => {
      if (await sync.onTimer(timer)) return;
      await live?.onTimer(timer);
    },
    onTick: async () => {},
  });
  await sync.start();
  await scheduler.pass(0);
  const events = new FakeEvents();
  await live.add("acme", events.open);
  const pollDueIn = () => scheduler.dueIn(syncPollTimer.key, syncPollTimer.timerId);
  const reconnectDueIn = () => scheduler.dueIn(liveSyncTimers.reconnectKey, "acme");
  return {
    live,
    events,
    scheduler,
    polls: () => polls,
    counted: live.countersFor("acme", counters),
    applied,
    connections,
    errors,
    pollDueIn,
    reconnectDueIn,
  };
}

verifies("agent-host.paperclip-live-events", () => {
  describe("events bring reads", () => {
    it("ten events within 300 ms bring one read, 300 ms after the first", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(0);
      const before = on.polls();

      for (let event = 0; event < 10; event += 1) {
        await on.events.current.say({ kind: "change" });
        await on.scheduler.pass(25);
      }
      expect(on.polls()).toBe(before);
      await on.scheduler.pass(50);

      expect(on.polls()).toBe(before + 1);
      expect(on.errors).toEqual([]);
    });

    it("counts a change the read after an event applies as an event, and one nothing announced as a poll", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "open" });

      await on.live.poll(async () => on.counted.applied("poll"));
      await on.events.current.say({ kind: "change" });
      await on.live.poll(async () => on.counted.applied("poll"));
      await on.live.poll(async () => on.counted.applied("poll"));

      expect(on.applied).toEqual(["catch-up", "event", "poll"]);
    });

    it("reads 300 ms after a resync, gathering the resyncs that follow, as a catch-up", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(0);
      const before = on.polls();

      for (let resync = 0; resync < 5; resync += 1) {
        await on.events.current.say({ kind: "resync" });
        await on.scheduler.pass(50);
      }
      expect(on.polls()).toBe(before);
      await on.scheduler.pass(50);

      expect(on.polls()).toBe(before + 1);
    });

    it("lets the next event bring a read when setting the batch's timer failed", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(0);
      const schedule = on.scheduler.schedule.bind(on.scheduler);
      const refused = new Error("The scheduler's store is full.");
      on.scheduler.schedule = async () => {
        on.scheduler.schedule = schedule;
        throw refused;
      };
      await on.events.current.say({ kind: "change" });
      const before = on.polls();

      await on.events.current.say({ kind: "change" });
      await on.scheduler.pass(300);

      expect(on.errors).toEqual([refused]);
      expect(on.polls()).toBe(before + 1);
    });

    it("reads at once when the socket opens, and polls every minute while it stays open", async () => {
      const on = await startLive();
      const before = on.polls();

      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(0);

      expect(on.polls()).toBe(before + 1);
      expect(on.pollDueIn()).toBe(60_000);
      expect(on.connections).toEqual(["connected"]);
    });
  });

  describe("reconnect", () => {
    it("waits 1, 2, 4 … up to 60 seconds between attempts, with full jitter", async () => {
      const on = await startLive(() => 0.999_999);
      const waits: (number | undefined)[] = [];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await on.events.current.say({ kind: "closed", refused: false });
        const wait = on.reconnectDueIn();
        waits.push(wait);
        await on.scheduler.pass(wait ?? 0);
      }

      expect(waits).toEqual([999, 1_999, 3_999, 7_999, 15_999, 31_999, 59_999, 59_999]);
      expect(on.events.sockets).toHaveLength(9);
    });

    it("draws each wait between 0 and its cap", async () => {
      const on = await startLive(() => 0.25);
      await on.events.current.say({ kind: "closed", refused: false });
      expect(on.reconnectDueIn()).toBe(250);
    });

    it("starts the waits from 1 second again once a socket stayed open 5 minutes", async () => {
      const on = await startLive(() => 0.999_999);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await on.events.current.say({ kind: "closed", refused: false });
        await on.scheduler.pass(on.reconnectDueIn() ?? 0);
      }
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(5 * 60_000);

      await on.events.current.say({ kind: "closed", refused: false });

      expect(on.reconnectDueIn()).toBe(999);
    });

    it("keeps the waits growing after a socket open less than 5 minutes", async () => {
      const on = await startLive(() => 0.999_999);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await on.events.current.say({ kind: "closed", refused: false });
        await on.scheduler.pass(on.reconnectDueIn() ?? 0);
      }
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(5 * 60_000 - 1_000);

      await on.events.current.say({ kind: "closed", refused: false });

      expect(on.reconnectDueIn()).toBe(7_999);
    });

    it("on a refused socket tries no more and polls at the rates without events", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(0);
      expect(on.pollDueIn()).toBe(60_000);

      await on.events.current.say({ kind: "closed", refused: true });
      await on.scheduler.pass(60 * 60_000);

      expect(on.events.sockets).toHaveLength(1);
      expect(on.reconnectDueIn()).toBeUndefined();
      expect(on.pollDueIn()).toBe(10_000);
      expect(on.connections).toEqual(["connected", "not-allowed"]);
    });

    it("tries a refused source again when a new key replaces its socket", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "closed", refused: true });
      const replaced = new FakeEvents();

      await on.live.add("acme", replaced.open);

      expect(replaced.sockets).toHaveLength(1);
    });

    it("drops what a replaced socket says, and closes it", async () => {
      const on = await startLive();
      const old = on.events.current;
      await on.live.add("acme", new FakeEvents().open);

      await old.say({ kind: "open" });

      expect(old.closed).toBe(true);
      expect(on.connections).toEqual([]);
    });

    it("leaves one socket open when two keys for one source come at once, and removing closes it", async () => {
      const on = await startLive();
      const first = new FakeEvents();
      const second = new FakeEvents();

      await Promise.all([on.live.add("acme", first.open), on.live.add("acme", second.open)]);

      expect(on.events.current.closed).toBe(true);
      expect(first.current.closed).toBe(true);
      expect(second.current.closed).toBe(false);
      await on.live.remove("acme");
      expect(second.current.closed).toBe(true);
    });

    it("sets a reconnect whose timer couldn't be set again on the next poll", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "open" });
      await on.scheduler.pass(0);
      const schedule = on.scheduler.schedule.bind(on.scheduler);
      const refused = new Error("The scheduler's store is full.");
      on.scheduler.schedule = async () => {
        on.scheduler.schedule = schedule;
        throw refused;
      };

      await on.events.current.say({ kind: "closed", refused: false });
      expect(on.errors).toEqual([refused]);
      expect(on.reconnectDueIn()).toBeUndefined();
      expect(on.connections).toEqual(["connected", "polling-only"]);
      await on.scheduler.pass((on.pollDueIn() ?? 0) - 1);
      expect(on.events.sockets).toHaveLength(1);

      await on.scheduler.pass(1);

      expect(on.events.sockets).toHaveLength(2);
    });

    it("closes the socket and tries no more once removed", async () => {
      const on = await startLive();
      await on.events.current.say({ kind: "closed", refused: false });

      await on.live.remove("acme");
      await on.scheduler.pass(60_000);

      expect(on.events.sockets).toHaveLength(1);
    });
  });

  describe("stop", () => {
    it("opens no socket for an add still running when it stops, nor for one after", async () => {
      const on = await startLive();
      const late = new FakeEvents();
      const after = new FakeEvents();

      const adding = on.live.add("acme", late.open);
      await on.live.stop();
      await adding;
      await on.live.add("acme", after.open);

      expect(late.sockets).toHaveLength(0);
      expect(after.sockets).toHaveLength(0);
      expect(on.events.current.closed).toBe(true);
    });
  });

  describe("all sources' state", () => {
    it("is connected only when every source is", () => {
      expect(combinedState([])).toBe("polling-only");
      expect(combinedState(["connected", "connected"])).toBe("connected");
      expect(combinedState(["connected", "polling-only"])).toBe("polling-only");
      expect(combinedState(["connected", "not-allowed"])).toBe("not-allowed");
      expect(combinedState(["not-allowed", "polling-only"])).toBe("polling-only");
    });
  });
});
