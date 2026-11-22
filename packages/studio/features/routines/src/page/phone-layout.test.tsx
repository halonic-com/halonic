// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { RoutinesHost, RoutineTarget } from "../api.ts";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";
import { daily, hostReading } from "./page.test-helper.tsx";
import { RoutineScreen } from "./routine-page.tsx";

beforeAll(openDialogsInJsdom);
afterEach(unmount);

const times = ["2026-11-23T06:30:00Z", "2026-11-24T06:30:00Z", "2026-11-25T06:30:00Z"];

/** Daily's page, on a phone unless told otherwise, with a host that can start a run. */
async function open(phone = true) {
  const runNow = vi.fn(async () => ({ started: true, runId: "run_1", shortId: "abc123" }) as const);
  const openTarget = vi.fn<(target: RoutineTarget) => void>();
  const { host } = hostReading(() => daily);
  const page = await show(
    <PresentationProvider presentation={phone ? "phone" : "desktop"}>
      <RoutineScreen
        host={
          {
            ...host,
            runNow,
            targets: async () => [
              { kind: "workflow", hubId: "acme", id: "briefing", name: "Briefing" },
            ],
            nextTimes: async () => ({ times, atNextCheck: false }),
          } as RoutinesHost
        }
        hubId="acme"
        id="daily"
        announce={() => {}}
        openTarget={openTarget}
      />
    </PresentationProvider>,
  );
  await act(async () => {});
  return { page, runNow, openTarget };
}

/** The radio of the picker sheet's option `value`, and the line that describes it. */
function optionLine(page: HTMLElement, value: string): string | null | undefined {
  const radio = page.ownerDocument.querySelector(`input[type="radio"][value="${value}"]`);
  return document.getElementById(radio?.getAttribute("aria-describedby") ?? "")?.textContent;
}

verifies("routines.page.phone-layout", () => {
  it("puts Run now in the bar at the bottom on both views, not in the header", async () => {
    const { page, runNow } = await open();
    const header = page.querySelector("header") as HTMLElement;
    expect(buttonNamed(header, "Run now")).toBeUndefined();
    const bar = page.querySelector(".action-bar") as HTMLElement;
    expect(buttonNamed(bar, "Run now")).toBeDefined();
    const runsTab = [...page.querySelectorAll('[role="tab"]')].find((tab) =>
      tab.textContent?.startsWith("Runs"),
    ) as HTMLElement;
    await act(async () => runsTab.click());
    const stillThere = buttonNamed(page.querySelector(".action-bar") as HTMLElement, "Run now");
    await act(async () => stillThere?.click());
    expect(runNow).toHaveBeenCalledOnce();
  });

  it("keeps Run now in the header on desktop, with no bar", async () => {
    const { page } = await open(false);
    expect(buttonNamed(page.querySelector("header") as HTMLElement, "Run now")).toBeDefined();
    expect(page.querySelector(".action-bar")).toBeNull();
  });

  it("shows each next start time on a line of its own", async () => {
    const { page } = await open();
    const lines = [...page.querySelectorAll("li")].map((line) => line.textContent);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Mon 23 Nov/);
    expect(page.textContent).not.toContain(" · Tue");
  });

  it("makes the whole When header row the switch's target, 48px high", async () => {
    const { page } = await open();
    const toggle = page.querySelector('input[role="switch"], input[type="checkbox"]');
    const target = toggle?.closest("label") as HTMLElement;
    expect(target.className).toContain("after:inset-0");
    const row = target.closest(".relative") as HTMLElement;
    expect(row.textContent).toContain("When");
    expect(row.className).toContain("phone:min-h-touch");
  });

  it("shows the sentence each Trigger option would write in the picker sheet, unless it's the label", async () => {
    const { page } = await open();
    const picker = buttonNamed(page, "On a schedule") as HTMLButtonElement;
    await act(async () => picker.click());
    expect(optionLine(page, "schedule")).toBe("Weekdays at 07:30");
    expect(optionLine(page, "manual")).toBeUndefined();
    expect(optionLine(page, "every")).toBe("Every hour (UTC)");
    expect(optionLine(page, "mail")).toBeUndefined();
  });

  it("opens what the routine starts from the Open row, only on a phone", async () => {
    const { page, openTarget } = await open();
    await act(async () => buttonNamed(page, "Open Briefing")?.click());
    expect(openTarget).toHaveBeenCalledWith(daily.target);
    unmount();
    const desktop = await open(false);
    expect(buttonNamed(desktop.page, "Open Briefing")).toBeUndefined();
  });

  it("puts Mo to Fr on one row of days and Sa Su on the next, at any width", async () => {
    for (const phone of [true, false]) {
      const { page } = await open(phone);
      const days = page.querySelector('fieldset[aria-label="Days"]') as HTMLElement;
      const rows = [...days.querySelectorAll("fieldset")].map((row) =>
        [...row.querySelectorAll("button")].map((chip) => chip.textContent?.trim()),
      );
      expect(rows).toEqual([
        ["Mo", "Tu", "We", "Th", "Fr"],
        ["Sa", "Su"],
      ]);
      unmount();
    }
  });
});
