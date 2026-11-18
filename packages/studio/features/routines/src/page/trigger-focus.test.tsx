// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { memoryHost, show, unmount } from "../test-support.tsx";
import { RoutineScreen } from "./routine-page.tsx";

afterEach(unmount);

const daily: RoutineView = {
  hubId: "acme",
  id: "daily",
  name: "Daily",
  enabled: true,
  trigger: { kind: "schedule", cron: "30 7 * * 1-5" },
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

/** A host that reads the daily routine. */
function dailyHost(): RoutinesHost {
  const { host } = memoryHost([], []);
  return {
    ...host,
    mailboxes: async () => [],
    targets: async () => [],
    nextTimes: async () => ({ times: [], atNextCheck: false }),
    read: async () => daily,
  } as RoutinesHost;
}

verifies("routines.when.trigger-fields", () => {
  it("gives the Trigger picker the focus when the page is asked for it", async () => {
    const page = await show(
      <RoutineScreen
        host={dailyHost()}
        hubId="acme"
        id="daily"
        announce={() => {}}
        triggerAsked={0}
      />,
    );

    const picker = page.querySelector("select");
    expect(picker).not.toBeNull();
    expect(document.activeElement).toBe(picker);
  });

  it("leaves the focus alone when the page isn't asked for it", async () => {
    const page = await show(
      <RoutineScreen host={dailyHost()} hubId="acme" id="daily" announce={() => {}} />,
    );

    expect(document.activeElement).not.toBe(page.querySelector("select"));
  });
});
