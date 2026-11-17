// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineChanges, RoutineNextTimes, RoutinesHost, RoutineView } from "../api.ts";
import { show, unmount } from "../test-support.tsx";
import { WhenCard } from "./when-card.tsx";
import { nextTime } from "./when-words.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const daily: RoutineView = {
  hubId: "acme",
  id: "daily",
  name: "Daily",
  enabled: true,
  trigger: { kind: "schedule", cron: "30 7 * * 1-5" },
  triggerSentence: "Weekdays at 07:30",
  summary: "Weekdays at 07:30 → Briefing",
  target: { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" },
  targetState: "ready",
  overlap: "skip",
  catchUp: "last",
  file: "hubs/acme/workflows/routines/daily.routine.yaml",
  everLive: true,
  changesNotLive: false,
  problems: [],
};

const times = (...times: string[]): RoutineNextTimes => ({ times, atNextCheck: false });

function hostWith(
  next: RoutineNextTimes,
  save: (changes: RoutineChanges) => Promise<void> = async () => {},
) {
  const saved: RoutineChanges[] = [];
  const host = {
    mailboxes: async () => [],
    nextTimes: async () => next,
    save: async (_ref: unknown, changes: RoutineChanges) => {
      saved.push(changes);
      await save(changes);
    },
  } as unknown as RoutinesHost;
  return { host, saved };
}

const toggle = (page: HTMLElement) =>
  page.querySelector<HTMLInputElement>("input[role=switch]") as HTMLInputElement;

verifies("routines.when.when-card", () => {
  it("shows the trigger in words and the next start times", async () => {
    const { host } = hostWith(
      times("2026-11-06T06:30:00Z", "2026-11-09T06:30:00Z", "2026-11-10T06:30:00Z"),
    );
    const page = await show(<WhenCard host={host} routine={daily} announce={() => {}} />);

    expect(page.textContent).toContain("When");
    expect(page.textContent).toContain("Weekdays at 07:30");
    expect(page.textContent).toMatch(
      /Next\s*\w{3} \d+ Nov \d\d:\d\d · \w{3} \d+ Nov \d\d:\d\d · \w{3} \d+ Nov/,
    );
    expect(toggle(page).getAttribute("aria-label")).toBe("Runs on its own");
    expect(toggle(page).checked).toBe(true);
  });

  it("names a time zone that isn't the device's", () => {
    expect(nextTime("2026-11-06T06:30:00Z", "Europe/Amsterdam", "America/New_York")).toBe(
      "Fri 6 Nov 07:30 (Europe/Amsterdam)",
    );
    expect(nextTime("2026-11-06T06:30:00Z", "Europe/Amsterdam", "Europe/Amsterdam")).toBe(
      "Fri 6 Nov 07:30",
    );
    expect(nextTime("2026-11-06T06:30:00Z", undefined, "Europe/Amsterdam")).toBe("Fri 6 Nov 07:30");
  });

  it("shows no times while the routine is off, and none for a manual one", async () => {
    const { host } = hostWith(times("2026-11-06T06:30:00Z"));
    const off = await show(
      <WhenCard host={host} routine={{ ...daily, enabled: false }} announce={() => {}} />,
    );
    expect(off.textContent).not.toContain("Next");
    unmount();

    const manual = await show(
      <WhenCard
        host={host}
        routine={{ ...daily, trigger: { kind: "manual" }, triggerSentence: "Manual only" }}
        announce={() => {}}
      />,
    );
    expect(manual.textContent).toContain("Starts only with Run now.");
    expect(manual.textContent).not.toContain("Next");
  });

  it("says an every routine that never ran starts at the next check", async () => {
    const { host } = hostWith({ times: [], atNextCheck: true });
    const page = await show(
      <WhenCard
        host={host}
        routine={{ ...daily, trigger: { kind: "every", interval: "1h" } }}
        announce={() => {}}
      />,
    );
    expect(page.textContent).toContain("At the next check (it hasn't run yet)");
  });

  it("turns the routine off at once and announces it", async () => {
    const { host, saved } = hostWith(times());
    const said: string[] = [];
    const page = await show(
      <WhenCard host={host} routine={daily} announce={(t) => said.push(t)} />,
    );

    await act(async () => toggle(page).click());

    expect(saved).toEqual([{ enabled: false }]);
    expect(said).toEqual(["Daily is off. It only runs with Run now."]);
  });

  it("announces the next time when it is turned on", async () => {
    const { host, saved } = hostWith(times("2026-11-06T06:30:00Z"));
    const said: string[] = [];
    const page = await show(
      <WhenCard
        host={host}
        routine={{ ...daily, enabled: false }}
        announce={(t) => said.push(t)}
      />,
    );

    await act(async () => toggle(page).click());

    expect(saved).toEqual([{ enabled: true }]);
    expect(said[0]).toMatch(/^Daily is on\. Next: \w{3} 6 Nov \d\d:\d\d\.$/);
  });

  it("shows why a change couldn't be saved and keeps the switch as saved", async () => {
    const { host } = hostWith(times(), async () => {
      throw new KindedError("unavailable", "The file is read-only.");
    });
    const said: string[] = [];
    const page = await show(
      <WhenCard host={host} routine={daily} announce={(t) => said.push(t)} />,
    );

    await act(async () => toggle(page).click());

    expect(page.textContent).toContain("Couldn't save the change. The file is read-only.");
    expect(toggle(page).checked).toBe(true);
    expect(said).toEqual([]);
  });

  it("can't turn on a routine that was never live, and says so", async () => {
    const { host, saved } = hostWith(times());
    const page = await show(
      <WhenCard
        host={host}
        routine={{ ...daily, enabled: false, everLive: false }}
        announce={() => {}}
      />,
    );

    await act(async () => toggle(page).click());

    expect(saved).toEqual([]);
    expect(page.textContent).toContain("Make this routine live first to turn it on.");
    expect(toggle(page).getAttribute("aria-disabled")).toBe("true");
  });
});
