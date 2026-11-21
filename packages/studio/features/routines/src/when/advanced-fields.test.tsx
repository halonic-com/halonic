// @vitest-environment jsdom

import { FieldAnnounceProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RoutineChanges, RoutinesHost, RoutineTrigger, RoutineView } from "../api.ts";
import { show, unmount } from "../test-support.tsx";
import { WhenCard } from "./when-card.tsx";

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

function routineWith(trigger: RoutineTrigger, enabled = true): RoutineView {
  return {
    hubId: "acme",
    id: "daily",
    name: "Daily",
    enabled,
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

async function card(trigger: RoutineTrigger, announced: string[] = [], enabled = true) {
  const saved: RoutineChanges[] = [];
  const host = {
    mailboxes: async () => [],
    nextTimes: async () => ({ times: [], atNextCheck: false }),
    save: async (_ref: unknown, changes: RoutineChanges) => {
      saved.push(changes);
    },
  } as unknown as RoutinesHost;
  const page = await show(
    <FieldAnnounceProvider announce={(text) => announced.push(text)}>
      <WhenCard host={host} routine={routineWith(trigger, enabled)} announce={() => {}} />
    </FieldAnnounceProvider>,
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

  it("reads a refused line's message once when it shows after the pause, and not again on leaving", async () => {
    vi.useFakeTimers();
    const announced: string[] = [];
    const { page } = await card(weekdays, announced);
    const cron = control(page, "Schedule (cron)");
    cron.focus();
    await type(cron, "0 8 *");
    await act(async () => vi.advanceTimersByTime(600));
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toEqual([
      "Schedule (cron): Cron needs 5 fields (minute hour day month weekday), got 3. Still runs on the last valid schedule until the cron is fixed.",
    ]);

    await leave(cron);
    cron.blur();
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toHaveLength(1);
  });

  it("leaves out the last-valid-schedule sentence while the routine is off", async () => {
    vi.useFakeTimers();
    const announced: string[] = [];
    const { page } = await card(weekdays, announced, false);
    const cron = control(page, "Schedule (cron)");
    cron.focus();
    await type(cron, "0 8 *");
    await act(async () => vi.advanceTimersByTime(600));
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toEqual([
      "Schedule (cron): Cron needs 5 fields (minute hour day month weekday), got 3.",
    ]);
    expect(page.textContent).not.toContain("Still runs on the last valid schedule");
  });

  it("opens Advanced by itself for a schedule the chips can't show", async () => {
    const { page } = await card({ kind: "schedule", cron: "0 9 1 * *" });
    expect(page.querySelector("details")?.open).toBe(true);
    const closed = await card(weekdays);
    expect(closed.page.querySelector("details")?.open).toBe(false);
  });

  it("drops its own inset on a phone, where the Disclosure's is enough", async () => {
    const schedule = await card({ kind: "schedule", cron: "0 9 1 * *" });
    expect(schedule.page.querySelector("details .pb-3")?.className).toContain("phone:px-0");
    const onlyWhen = await card({
      kind: "signal",
      name: "mail.tagged",
      when: { exists: "mail.id" },
    });
    expect(onlyWhen.page.querySelector("details .pb-3")?.className).toContain("phone:px-0");
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
