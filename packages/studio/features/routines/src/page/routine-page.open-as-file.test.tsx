// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { installFakePopover, memoryHost, show, unmount } from "../test-support.tsx";
import { RoutineScreen } from "./routine-page.tsx";

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

let restorePopover: () => void;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  restorePopover = installFakePopover();
});
afterEach(() => {
  restorePopover();
  unmount();
  vi.useRealTimers();
});

const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const menuLabels = () => menuItems().map((each) => each.textContent);

/** Shows "Daily" with its ⋮ menu open; `openFile` is what the app gives the page, if it can open tabs. */
async function openMenu(openFile?: (path: string) => void, presentation?: "phone") {
  const host = {
    ...memoryHost([], []).host,
    mailboxes: async () => [],
    targets: async () => [],
    nextTimes: async () => ({ times: [], atNextCheck: false }),
    read: async () => daily,
  } as RoutinesHost;
  const screen = (
    <RoutineScreen
      host={host}
      hubId="acme"
      id="daily"
      announce={() => {}}
      {...(openFile && { openFile })}
    />
  );
  const page = await show(
    presentation === undefined ? (
      screen
    ) : (
      <PresentationProvider presentation={presentation}>{screen}</PresentationProvider>
    ),
  );
  act(() =>
    page.querySelector<HTMLElement>('button[aria-label="More actions for Daily"]')?.click(),
  );
}

verifies("routines.page.open-as-file", () => {
  it("opens the routine's file in a tab from ⋮", async () => {
    const openFile = vi.fn();
    await openMenu(openFile);

    expect(menuLabels()).toEqual(["Open as file", "Delete"]);
    await act(async () => menuItems()[0]?.click());

    expect(openFile).toHaveBeenCalledExactlyOnceWith(
      "hubs/acme/workflows/routines/daily.routine.yaml",
    );
  });

  it("offers no Open as file where the app can't open a tab", async () => {
    await openMenu();

    expect(menuLabels()).toEqual(["Delete"]);
  });

  it("offers none on a phone, even though the app passes openFile there", async () => {
    await openMenu(vi.fn(), "phone");

    expect(menuLabels()).toEqual(["Rename", "Delete"]);
  });
});
