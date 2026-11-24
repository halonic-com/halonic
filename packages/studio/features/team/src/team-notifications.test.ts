import {
  type AgentNotice,
  type NoticeTarget,
  type Notifier,
  QuietHoursNotifier,
} from "@halonicjs/studio-services";
import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchTeamNotifications } from "./team-notifications.ts";

const now = new Date("2026-11-24T10:00:00.000Z");
const clock = { now: () => now, timeZone: "UTC" };

function recorder() {
  const shown: AgentNotice[] = [];
  const clicks: (() => void)[] = [];
  const notifier: Notifier = {
    show(notice, onClick) {
      shown.push(notice);
      clicks.push(onClick);
      return Promise.resolve();
    },
  };
  return { shown, clicks, notifier };
}

verifies("team.notifications", () => {
  describe("watchTeamNotifications", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("notifies a change once, opens the seat on a click, and ignores what was there at the start", async () => {
      const team = new FakeTeamStatus({ now: () => now });
      const { source } = team.addSource();
      team.addSeat(source, { label: "Seat A", state: "full" });
      const { shown, clicks, notifier } = recorder();
      const opened: NoticeTarget[] = [];
      const watch = watchTeamNotifications(team, notifier, {
        clock,
        open: (target) => opened.push(target),
        onError: (error) => {
          throw error;
        },
      });
      await watch.ready;

      const seat = team.addSeat(source, { label: "Seat D", state: "signed-out", agents: ["kim"] });
      await vi.waitFor(() => expect(shown).toHaveLength(1));
      team.addSeat(source, { label: "Seat E" });
      // The watch reads each change in turn, so once Seat F shows, Seat E's read is done.
      team.addSeat(source, { label: "Seat F", state: "signed-out" });
      await vi.waitFor(() => expect(shown).toHaveLength(2));
      await watch.stop();

      expect(shown.map((notice) => notice.title)).toEqual([
        "Seat D is signed out",
        "Seat F is signed out",
      ]);
      expect(shown[0]).toEqual({
        reason: "seat",
        title: "Seat D is signed out",
        body: "Since 10:00 · 1 agent on it",
        target: { kind: "seat", id: seat.id },
      });
      clicks[0]?.();
      expect(opened).toEqual([{ kind: "seat", id: seat.id }]);
    });

    it("reports a change it fails to notify and goes on watching", async () => {
      const team = new FakeTeamStatus({ now: () => now });
      const { source } = team.addSource();
      const shown: string[] = [];
      const failure = new Error("the system refused");
      const notifier: Notifier = {
        show(notice) {
          if (notice.title === "Seat D is signed out") throw failure;
          shown.push(notice.title);
          return Promise.resolve();
        },
      };
      const errors: unknown[] = [];
      const watch = watchTeamNotifications(team, notifier, {
        clock,
        open: vi.fn(),
        onError: (error) => errors.push(error),
      });
      await watch.ready;

      team.addSeat(source, { label: "Seat D", state: "signed-out" });
      await vi.waitFor(() => expect(errors).toEqual([failure]));
      team.addSeat(source, { label: "Seat F", state: "signed-out" });
      await vi.waitFor(() => expect(shown).toEqual(["Seat F is signed out"]));
      await watch.stop();
    });

    it("notifies when the merge queue is held up", async () => {
      const team = new FakeTeamStatus({ now: () => now });
      const { source } = team.addSource();
      const { shown, notifier } = recorder();
      const watch = watchTeamNotifications(team, notifier, {
        clock,
        open: vi.fn(),
        onError: vi.fn(),
      });
      await watch.ready;

      team.setMergeQueue(source, {
        health: "runners-busy",
        runnerWaitMinutes: 12,
        waiting: ["a", "b"],
      });
      await vi.waitFor(() => expect(shown).toHaveLength(1));
      await watch.stop();

      expect(shown[0]).toMatchObject({
        reason: "queue",
        title: "Runners busy · pushes are on hold",
        body: "Longest wait 12 min · 2 PRs in the queue",
        target: { kind: "merge-queue", id: source },
      });
    });

    it("holds a notification in quiet hours for the summary when they end", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      vi.setSystemTime(now);
      const minute = now.getHours() * 60 + now.getMinutes();
      const team = new FakeTeamStatus({ now: () => now });
      const { source } = team.addSource();
      const { shown, notifier: system } = recorder();
      const quiet = new QuietHoursNotifier(system, {
        quietHours: () => ({ startMinute: minute, endMinute: minute + 60 }),
        onError: vi.fn(),
      });
      const held = vi.spyOn(quiet, "show");
      const watch = watchTeamNotifications(team, quiet, { clock, open: vi.fn(), onError: vi.fn() });
      await watch.ready;

      team.addSeat(source, { label: "Seat D", state: "signed-out" });
      await vi.waitFor(() => expect(held).toHaveBeenCalledOnce());
      expect(shown).toEqual([]);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      await watch.stop();
      quiet.stop();

      expect(shown.map((notice) => notice.reason)).toEqual(["summary"]);
    });
  });
});
