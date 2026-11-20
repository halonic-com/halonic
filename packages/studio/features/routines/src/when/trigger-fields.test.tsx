// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RoutineChanges, RoutinesHost, RoutineTrigger, RoutineView } from "../api.ts";
import { show, typeInto, unmount } from "../test-support.tsx";
import { WhenCard } from "./when-card.tsx";

afterEach(unmount);

function routineWith(trigger: RoutineTrigger): RoutineView {
  return {
    hubId: "acme",
    id: "daily",
    name: "Daily",
    enabled: true,
    trigger,
    triggerSentence: "Weekdays at 07:30",
    summary: "Weekdays at 07:30 → Briefing",
    targetName: "Briefing",
    target: { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" },
    targetState: "ready",
    overlap: "skip",
    catchUp: "last",
    file: "hubs/acme/workflows/routines/daily.routine.yaml",
    everLive: true,
    changesNotLive: false,
    problems: [],
  };
}

async function card(trigger: RoutineTrigger) {
  const saved: RoutineChanges[] = [];
  const host = {
    mailboxes: async () => [],
    nextTimes: async () => ({ times: [], atNextCheck: false }),
    save: async (_ref: unknown, changes: RoutineChanges) => {
      saved.push(changes);
    },
  } as unknown as RoutinesHost;
  const page = await show(
    <WhenCard host={host} routine={routineWith(trigger)} announce={() => {}} />,
  );
  return { page, saved };
}

const chip = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  ) as HTMLButtonElement;

const press = (button: HTMLElement) => act(async () => button.click());

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const weekdays: RoutineTrigger = {
  kind: "schedule",
  cron: "30 7 * * 1-5",
  timeZone: "Europe/Amsterdam",
};

verifies("routines.when.trigger-fields", () => {
  it("writes a kind's default when another kind is picked, and nothing for the same one", async () => {
    const { page, saved } = await card({ kind: "manual" });
    const select = page.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual([
      "Manual only",
      "On a schedule",
      "Every …",
      "New mail",
      "On a signal",
    ]);
    await choose(select, "manual");
    expect(saved).toEqual([]);
    await choose(select, "schedule");
    expect(saved[0]?.trigger).toMatchObject({ kind: "schedule", cron: "0 8 * * 1-5" });
    await choose(select, "every");
    expect(saved[1]?.trigger).toEqual({ kind: "every", interval: "1h" });
    await choose(select, "signal");
    expect(saved[2]?.trigger).toEqual({ kind: "signal", name: "mail.tagged" });
  });

  it("shows a kind it can't switch to as that kind", async () => {
    const { page } = await card({ kind: "webhook" });
    const select = page.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("webhook");
    expect(select.selectedOptions[0]?.text).toBe("From a web request");
  });

  it("writes the days and the time into the cron line and keeps the time zone", async () => {
    const { page, saved } = await card(weekdays);
    expect(chip(page, "Mo").getAttribute("aria-pressed")).toBe("true");
    expect(chip(page, "Sa").getAttribute("aria-pressed")).toBe("false");
    await press(chip(page, "Sa"));
    expect(saved[0]?.trigger).toEqual({ ...weekdays, cron: "30 7 * * 1-6" });
    await typeInto(page.querySelector("input[type=time]") as HTMLInputElement, "18:00");
    expect(saved[1]?.trigger).toEqual({ ...weekdays, cron: "0 18 * * 1-5" });
  });

  it("names each day chip by the whole day and keeps its two letters", async () => {
    const { page } = await card(weekdays);
    const days = [...page.querySelectorAll("fieldset[aria-label='Days'] button")];
    expect(days.map((day) => day.getAttribute("aria-label"))).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(days.map((day) => day.textContent)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });

  it("keeps the last day on and says so until another day is on", async () => {
    const { page, saved } = await card({ kind: "schedule", cron: "0 8 * * 1" });
    await press(chip(page, "Mo"));
    expect(saved).toEqual([]);
    expect(page.textContent).toContain("Pick at least one day.");
    await press(chip(page, "Tu"));
    expect(saved[0]?.trigger).toMatchObject({ cron: "0 8 * * 1,2" });
    expect(page.textContent).not.toContain("Pick at least one day.");
  });

  it("shows no chips for a schedule more detailed than them", async () => {
    const { page } = await card({ kind: "schedule", cron: "*/15 * * * *" });
    expect(page.textContent).toContain(
      "This schedule is more detailed than the day picker. Edit it as cron below.",
    );
    expect(chip(page, "Mo")).toBeUndefined();
    expect(page.querySelector("input[type=time]")).toBeNull();
  });

  it("writes the count and the unit of an interval", async () => {
    const { page, saved } = await card({ kind: "every", interval: "1h" });
    const count = page.querySelector("input[type=number]") as HTMLInputElement;
    expect(count.value).toBe("1");
    await typeInto(count, "2");
    expect(saved[0]?.trigger).toEqual({ kind: "every", interval: "2h" });
    await typeInto(count, "0");
    expect(saved).toHaveLength(1);
    await choose(page.querySelectorAll("select")[1] as HTMLSelectElement, "d");
    expect(saved[1]?.trigger).toEqual({ kind: "every", interval: "1d" });
  });

  it("leaves the fields empty for an interval the form can't show", async () => {
    const { page } = await card({ kind: "every", interval: "1.5h" });
    expect((page.querySelector("input[type=number]") as HTMLInputElement).value).toBe("");
  });

  it("lets the count and the unit shrink and wrap on a phone, for Every … and New mail", async () => {
    const triggers: readonly RoutineTrigger[] = [
      { kind: "every", interval: "1h" },
      { kind: "mail", connector: "acme-gmail", query: "in:inbox", every: "2m" },
    ];
    for (const trigger of triggers) {
      const { page } = await card(trigger);
      const count = page.querySelector("input[type=number]") as HTMLInputElement;
      const row = count.closest(".flex.gap-3") as HTMLElement;
      // jsdom draws nothing, so the classes stand in for the 320px and 195px checks in a browser.
      expect(row.className).toBe("flex gap-3 phone:flex-wrap");
      const [countSide, unitSide] = row.children;
      expect(countSide?.className).toBe("phone:min-w-16 phone:flex-1");
      expect(unitSide?.className).toBe("phone:min-w-0");
      unmount();
    }
  });

  it("shows why a change couldn't be saved", async () => {
    const host = {
      mailboxes: async () => [],
      nextTimes: async () => ({ times: [], atNextCheck: false }),
      save: async () => {
        throw new Error("disk full");
      },
    } as unknown as RoutinesHost;
    const page = await show(
      <WhenCard host={host} routine={routineWith(weekdays)} announce={() => {}} />,
    );
    await press(chip(page, "Sa"));
    expect(page.textContent).toContain("Couldn't save the change.");
  });
});
