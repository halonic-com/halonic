import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentNotice, Notifier } from "./agent-notifications.ts";
import { isQuiet, type QuietHours, QuietHoursNotifier } from "./quiet-hours.ts";

/** 22:00 to 07:00, past midnight. */
const night: QuietHours = { startMinute: 22 * 60, endMinute: 7 * 60 };

function card(id: string): AgentNotice {
  return {
    reason: "card",
    title: "New card from Liam",
    body: "Ship it?",
    target: { kind: "inbox-item", id },
  };
}

function notifierAt(quietHours: QuietHours | undefined) {
  const shown: AgentNotice[] = [];
  const inner: Notifier = {
    show(notice) {
      shown.push(notice);
      return Promise.resolve();
    },
  };
  const errors: unknown[] = [];
  const notifier = new QuietHoursNotifier(inner, {
    quietHours: () => quietHours,
    onError: (error) => errors.push(error),
  });
  return { notifier, shown, errors };
}

verifies("services.agent-quiet-hours", () => {
  describe("QuietHoursNotifier", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("holds three cards back during quiet hours, then shows one summary when they end", async () => {
      vi.setSystemTime(new Date(2026, 10, 24, 23, 0));
      const { notifier, shown, errors } = notifierAt(night);
      for (const id of ["a", "b", "c"]) await notifier.show(card(id), () => undefined);
      expect(shown).toEqual([]);

      await vi.advanceTimersByTimeAsync(8 * 60 * 60_000 - 1);
      expect(shown).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(shown).toEqual([
        {
          reason: "summary",
          title: "3 new during quiet hours",
          body: "",
          target: { kind: "inbox", id: "" },
        },
      ]);
      expect(errors).toEqual([]);
    });

    it("counts a single held card as 1 new during quiet hours", async () => {
      vi.setSystemTime(new Date(2026, 10, 24, 23, 0));
      const { notifier, shown } = notifierAt(night);
      await notifier.show(card("a"), () => undefined);

      await vi.advanceTimersByTimeAsync(8 * 60 * 60_000);
      expect(shown).toEqual([
        {
          reason: "summary",
          title: "1 new during quiet hours",
          body: "",
          target: { kind: "inbox", id: "" },
        },
      ]);
    });

    it("shows a card outside quiet hours at once", async () => {
      vi.setSystemTime(new Date(2026, 10, 24, 12, 0));
      const { notifier, shown } = notifierAt(night);
      await notifier.show(card("a"), () => undefined);
      expect(shown).toEqual([card("a")]);
    });

    it("shows every card at once when no quiet hours are set", async () => {
      vi.setSystemTime(new Date(2026, 10, 24, 23, 0));
      const { notifier, shown } = notifierAt(undefined);
      await notifier.show(card("a"), () => undefined);
      expect(shown).toEqual([card("a")]);
    });

    it("shows no summary when nothing came in, nor after stop", async () => {
      vi.setSystemTime(new Date(2026, 10, 24, 23, 0));
      const { notifier, shown } = notifierAt(night);
      await notifier.show(card("a"), () => undefined);
      notifier.stop();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
      expect(shown).toEqual([]);
    });

    it("hears a summary the system refused", async () => {
      vi.setSystemTime(new Date(2026, 10, 24, 23, 0));
      const refusal = new Error("notifications are off");
      const errors: unknown[] = [];
      const notifier = new QuietHoursNotifier(
        { show: () => Promise.reject(refusal) },
        { quietHours: () => night, onError: (error) => errors.push(error) },
      );
      await notifier.show(card("a"), () => undefined);
      await vi.advanceTimersByTimeAsync(8 * 60 * 60_000);
      expect(errors).toEqual([refusal]);
    });

    it("tells quiet from not, within a day and past midnight", () => {
      const day: QuietHours = { startMinute: 9 * 60, endMinute: 17 * 60 };
      const at = (hour: number) => new Date(2026, 10, 24, hour, 0);
      expect([isQuiet(day, at(9)), isQuiet(day, at(16)), isQuiet(day, at(17))]).toEqual([
        true,
        true,
        false,
      ]);
      expect([isQuiet(night, at(22)), isQuiet(night, at(3)), isQuiet(night, at(7))]).toEqual([
        true,
        true,
        false,
      ]);
      expect(isQuiet({ startMinute: 60, endMinute: 60 }, at(1))).toBe(false);
    });
  });
});
