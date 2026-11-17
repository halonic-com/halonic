// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RoutineChanges, RoutinesHost, RoutineTrigger, RoutineView } from "../api.ts";
import { show, unmount } from "../test-support.tsx";
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

/** The input or text area a label names. */
function control(page: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement {
  const text = [...page.querySelectorAll("label")].find((item) =>
    item.textContent?.startsWith(label),
  );
  const target =
    text?.htmlFor === undefined ? null : page.querySelector(`#${CSS.escape(text.htmlFor)}`);
  return (target ?? text?.querySelector("input, textarea")) as
    | HTMLInputElement
    | HTMLTextAreaElement;
}

async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const leave = (element: HTMLElement) =>
  act(async () => {
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });

const weekdays: RoutineTrigger = {
  kind: "schedule",
  cron: "30 7 * * 1-5",
  timeZone: "Europe/Amsterdam",
};

verifies("routines.when.advanced", () => {
  it("shows the cron line and what it means", async () => {
    const { page } = await card(weekdays);
    expect(control(page, "Schedule (cron)").value).toBe("30 7 * * 1-5");
    expect(page.textContent).toContain("Weekdays at 07:30");
    expect(page.textContent).toContain("minute hour day month weekday");
  });

  it("writes a cron line the engine accepts and keeps the time zone", async () => {
    const { page, saved } = await card(weekdays);
    await type(control(page, "Schedule (cron)"), "*/15 * * * *");
    expect(saved[0]?.trigger).toEqual({ ...weekdays, cron: "*/15 * * * *" });
  });

  it("writes nothing for a line the engine refuses, and says why once the field is left", async () => {
    const { page, saved } = await card(weekdays);
    const cron = control(page, "Schedule (cron)");
    await type(cron, "0 8 *");
    expect(saved).toEqual([]);
    expect(page.textContent).not.toContain("Cron needs 5 fields");
    await leave(cron);
    expect(page.textContent).toContain(
      "Cron needs 5 fields (minute hour day month weekday), got 3",
    );
    expect(page.textContent).toContain(
      "Still runs on the last valid schedule until the cron is fixed.",
    );
  });

  it("opens Advanced by itself for a schedule the chips can't show", async () => {
    const { page } = await card({ kind: "schedule", cron: "0 9 1 * *" });
    expect(page.querySelector("details")?.open).toBe(true);
    const closed = await card(weekdays);
    expect(closed.page.querySelector("details")?.open).toBe(false);
  });

  it("writes the schedule without a time zone for 'No time zone'", async () => {
    const { page, saved } = await card(weekdays);
    const zone = page.querySelectorAll("select")[1] as HTMLSelectElement;
    expect(zone.value).toBe("Europe/Amsterdam");
    expect(zone.options[0]?.text).toBe("No time zone (uses the computer's)");
    await act(async () => {
      zone.value = "";
      zone.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(saved[0]?.trigger).toEqual({ kind: "schedule", cron: "30 7 * * 1-5" });
  });

  it("shows the engine's message for a time zone it doesn't know", async () => {
    const { page } = await card({ ...weekdays, timeZone: "Mars/Olympus" });
    expect(page.textContent).toContain('Unknown time zone "Mars/Olympus"');
  });
});

verifies("routines.when.signal-fields", () => {
  const signal: RoutineTrigger = { kind: "signal", name: "mail.tagged" };

  it("writes the name as it is typed and keeps the last one when it is emptied", async () => {
    const { page, saved } = await card(signal);
    const name = control(page, "Signal name");
    await type(name, "deploy.done");
    expect(saved[0]?.trigger).toEqual({ kind: "signal", name: "deploy.done" });
    await type(name, "");
    expect(saved).toHaveLength(1);
    expect(page.textContent).toContain("Give the signal a name.");
  });

  it("writes the condition once it is JSON and not when it isn't", async () => {
    const { page, saved } = await card(signal);
    const when = control(page, "Only when");
    await type(when, '{"exists":"mail.id"}');
    expect(saved[0]?.trigger).toEqual({ ...signal, when: { exists: "mail.id" } });
    await type(when, "{");
    await leave(when);
    expect(saved).toHaveLength(1);
    expect(page.textContent).toContain("Not valid JSON.");
  });

  it("writes nothing for JSON that is no condition", async () => {
    const { page, saved } = await card(signal);
    const when = control(page, "Only when");
    await type(when, '{"foo":1}');
    await leave(when);
    expect(saved).toHaveLength(0);
    expect(page.textContent).toContain("Not a condition Halonic knows.");
  });

  it("starts Advanced open when there is a condition, and drops it when emptied", async () => {
    const withWhen: RoutineTrigger = { ...signal, when: { exists: "mail.id" } };
    const { page, saved } = await card(withWhen);
    expect(page.querySelector("details")?.open).toBe(true);
    await type(control(page, "Only when"), "");
    expect(saved[0]?.trigger).toEqual(signal);
  });
});
