// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RoutineChanges, RoutinesHost, RoutineTrigger, RoutineView } from "../api.ts";
import { show, unmount } from "../test-support.tsx";
import { RulesSection } from "./rules-section.tsx";

afterEach(unmount);

function routineOn(trigger: RoutineTrigger): RoutineView {
  return {
    hubId: "acme",
    id: "daily",
    name: "Daily",
    enabled: true,
    trigger,
    triggerSentence: "",
    summary: "",
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

async function rules(trigger: RoutineTrigger) {
  const saved: RoutineChanges[] = [];
  const host = {
    save: async (_ref: unknown, changes: RoutineChanges) => {
      saved.push(changes);
    },
  } as unknown as RoutinesHost;
  const page = await show(<RulesSection host={host} routine={routineOn(trigger)} />);
  return { page, saved };
}

const schedule: RoutineTrigger = { kind: "schedule", cron: "30 7 * * 1-5" };

verifies("routines.rules.busy-and-missed", () => {
  it("shows both rules on a schedule and writes the one picked", async () => {
    const { page, saved } = await rules(schedule);
    const selects = [...page.querySelectorAll("select")] as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    await act(async () => {
      (selects[0] as HTMLSelectElement).value = "queue";
      selects[0]?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(saved).toEqual([{ overlap: "queue" }]);
    await act(async () => {
      (selects[1] as HTMLSelectElement).value = "all";
      selects[1]?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(saved.at(-1)).toEqual({ catchUp: "all" });
  });

  it("shows only the missed times for New mail", async () => {
    const { page } = await rules({ kind: "mail", connector: "g", query: "in:inbox", every: "2m" });
    expect(page.textContent).toContain("Missed while closed or asleep");
    expect(page.textContent).not.toContain("still busy");
  });

  it("shows only the busy rule for a web request and none for Manual only", async () => {
    const web = await rules({ kind: "webhook" });
    expect(web.page.textContent).toContain("still busy");
    expect(web.page.textContent).not.toContain("Missed while");
    unmount();
    const manual = await rules({ kind: "manual" });
    expect(manual.page.textContent).not.toContain("Rules");
  });
});
