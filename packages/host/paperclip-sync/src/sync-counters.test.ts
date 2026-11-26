import type { SyncBatch, SyncCollection } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KeptCollection } from "./kept-collection.ts";
import { SyncCounters, syncLogEveryMs } from "./sync-counters.ts";
import type { SyncPersistence } from "./sync-persistence.ts";

/** A clock the test moves by hand. */
function movingClock(startAt: string) {
  let now = Date.parse(startAt);
  return {
    clock: { now: () => new Date(now) },
    pass: (ms: number) => {
      now += ms;
    },
  };
}

function counters(startAt = "2026-11-26T09:00:00.000Z") {
  const time = movingClock(startAt);
  const lines: string[] = [];
  const made = new SyncCounters({ clock: time.clock, log: (line) => lines.push(line) });
  return { counters: made, lines, pass: time.pass };
}

const nowhere: SyncPersistence = {
  load: async () => undefined,
  save: async () => undefined,
  clear: async () => undefined,
};

verifies("agent-host.sync-diagnostics", () => {
  describe("SyncCounters", () => {
    it("reports each source's share of the changes applied", () => {
      const { counters: made } = counters();
      made.applied("poll", "2026-11-26T08:59:58.000Z");
      made.applied("poll", "2026-11-26T08:59:58.000Z");
      made.applied("poll", "2026-11-26T08:59:58.000Z");
      made.applied("event", "2026-11-26T08:59:59.500Z");

      const { updates } = made.diagnostics();

      expect(updates.poll).toEqual({ count: 3, share: 0.75 });
      expect(updates.event).toEqual({ count: 1, share: 0.25 });
      expect(updates["catch-up"]).toEqual({ count: 0, share: 0 });
      expect(updates.write).toEqual({ count: 0, share: 0 });
    });

    it("times polls and events from the source's change, and never below 0", () => {
      const { counters: made } = counters();
      made.applied("poll", "2026-11-26T08:59:50.000Z");
      made.applied("poll", "2026-11-26T08:59:58.000Z");
      made.applied("event", "2026-11-26T09:00:05.000Z");
      made.applied("catch-up", "2026-11-20T00:00:00.000Z");

      const diagnostics = made.diagnostics();

      expect(diagnostics.pollLag).toEqual({ count: 2, p50Ms: 2000, p95Ms: 10_000 });
      expect(diagnostics.eventLag).toEqual({ count: 1, p50Ms: 0, p95Ms: 0 });
    });

    it("counts a change a poll found while events were connected as missed by events", () => {
      const { counters: made } = counters();
      made.applied("poll");
      made.setConnection("connected");
      made.applied("poll");
      made.applied("event");

      expect(made.diagnostics().missedByEvents).toBe(1);
    });

    it("counts reconnects and the time spent in each connection", () => {
      const { counters: made, pass } = counters();
      pass(60_000);
      made.setConnection("connected");
      pass(120_000);
      made.setConnection("polling-only");
      pass(30_000);
      made.setConnection("connected");
      pass(10_000);
      made.setConnection("not-allowed");
      pass(5000);

      const diagnostics = made.diagnostics();

      expect(diagnostics.reconnects).toBe(1);
      expect(diagnostics.connection).toBe("not-allowed");
      expect(diagnostics.timeIn).toEqual({
        connected: 130_000,
        "polling-only": 90_000,
        "not-allowed": 5000,
      });
      expect(diagnostics.windowMs).toBe(225_000);
    });

    it("times each route by its template, with its failures and bytes", () => {
      const { counters: made } = counters();
      made.called({
        method: "GET",
        route: "companies/:company/issues",
        status: 200,
        ms: 300,
        bytes: 900,
      });
      made.called({
        method: "GET",
        route: "companies/:company/issues",
        status: 502,
        ms: 100,
        bytes: 50,
      });
      made.called({ method: "GET", route: "issues/:task", status: "offline", ms: 40, bytes: 0 });

      expect(made.diagnostics().routes).toEqual([
        {
          method: "GET",
          route: "companies/:company/issues",
          count: 2,
          p50Ms: 100,
          p95Ms: 300,
          failed: 1,
          bytes: 950,
        },
        {
          method: "GET",
          route: "issues/:task",
          count: 1,
          p50Ms: 40,
          p95Ms: 40,
          failed: 1,
          bytes: 0,
        },
      ]);
    });

    it("forgets what happened more than 24 hours ago", () => {
      const { counters: made, pass } = counters();
      made.applied("poll");
      made.called({ method: "GET", route: "issues/:task", status: 200, ms: 40, bytes: 10 });
      pass(24 * 60 * 60_000 + 1);
      made.applied("write");

      const diagnostics = made.diagnostics();

      expect(diagnostics.updates.poll.count).toBe(0);
      expect(diagnostics.updates.write).toEqual({ count: 1, share: 1 });
      expect(diagnostics.routes).toEqual([]);
      expect(diagnostics.timeIn["polling-only"]).toBe(24 * 60 * 60_000);
    });

    it("writes a line on each change of connection and every 15 minutes, with counts only", () => {
      const { counters: made, lines, pass } = counters();
      made.applied("poll", "2026-11-26T08:59:59.000Z");
      made.tick();
      expect(lines).toEqual([]);

      made.setConnection("not-allowed");
      made.setConnection("not-allowed");
      pass(syncLogEveryMs - 1);
      made.tick();
      expect(lines).toHaveLength(1);
      pass(1);
      made.tick();

      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(
        "Sync: not-allowed; updates event 0 (0 %), poll 1 (100 %), catch-up 0 (0 %), write 0 (0 %); " +
          "event lag none; poll lag p50 1000 ms p95 1000 ms; missed by events 0; reconnects 0; 0 calls\n",
      );
    });
  });

  describe("KeptCollection with counters", () => {
    it("counts its first read as a catch-up, a read of what changed as a poll, and a write", async () => {
      const { counters: made } = counters();
      let next: SyncBatch<{ id: string; title: string }> = {
        kind: "all",
        items: [{ id: "acme-1", title: "Ship the release" }],
        removed: [],
        asOf: "2026-11-26T08:59:00.000Z",
      };
      const collection: SyncCollection<{ id: string; title: string }> = {
        name: "inbox",
        mapping: "1",
        read: async () => next,
      };
      const kept = new KeptCollection(collection, {
        source: "paperclip:acme",
        persistence: nowhere,
        warn: () => undefined,
        counters: made,
      });

      await kept.sync();
      next = { ...next, kind: "changed", items: [{ id: "acme-1", title: "Ship it" }] };
      await kept.sync();
      // A read that changed nothing counts nothing.
      await kept.sync();
      await kept.update("acme-1", (item) => ({ ...item, title: "Shipped" }));

      const { updates } = made.diagnostics();
      expect(updates["catch-up"].count).toBe(1);
      expect(updates.poll.count).toBe(1);
      expect(updates.write.count).toBe(1);
    });
  });
});
