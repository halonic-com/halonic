// @vitest-environment jsdom

import type { MenuEntry } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import type { HelpContribution } from "../points/frame.ts";
import { showPlace } from "../points/frame.ts";
import { createShell } from "../shell.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { helpMenuEntries } from "./help-menu.ts";
import { PlacesList } from "./places-list.tsx";

let uninstallPopover: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
});

const contextFor = (): WorkspaceContext => ({}) as WorkspaceContext;

/** The Help menu's entries for the groups the features add, as the window builds them. */
function entriesFor(groups: readonly (HelpContribution & { readonly featureId: string })[]) {
  const shell = createShell({
    features: [...new Set(groups.map((group) => group.featureId))].map((featureId) =>
      defineFeature({
        id: featureId,
        title: featureId,
        register: (studio) => {
          for (const { featureId: owner, ...group } of groups) {
            if (owner === featureId) studio.help.add(group);
          }
        },
      }),
    ),
  });
  return helpMenuEntries(shell.contributions.help.list(), contextFor);
}

/** What the menu shows, one string per entry: `-` for a divider, `# ` before a heading. */
function shown(entries: readonly MenuEntry[]): string[] {
  return entries.map((entry) => {
    if (entry === "divider") return "-";
    if ("heading" in entry) return `# ${entry.heading}`;
    return entry.label;
  });
}

function renderList(help: readonly MenuEntry[], onSettings?: () => void) {
  const announcer = createAnnouncer({ timers: new FakeTimers() });
  return render(
    <PlacesList
      places={[showPlace("home", undefined)]}
      tabs={new TabSet()}
      announcer={announcer}
      onSettings={onSettings}
      help={help}
    />,
  );
}

const firstRun = (picked: string[]) => ({
  featureId: "first-run",
  id: "first-run.help",
  order: 20,
  title: "First run",
  items: () => [
    { id: "guide", label: "Show the guide", run: () => picked.push("guide") },
    { id: "start-over", label: "Start over", run: () => picked.push("start-over") },
  ],
});

verifies("shell.help-menu", () => {
  it("lists the groups by order, each under its title, with a divider between them", () => {
    const entries = entriesFor([
      firstRun([]),
      {
        featureId: "doctor",
        id: "doctor.help",
        order: 10,
        items: () => [{ id: "check", label: "Check this computer", run: () => {} }],
      },
    ]);
    expect(shown(entries)).toEqual([
      "Check this computer",
      "-",
      "# First run",
      "Show the guide",
      "Start over",
    ]);
  });

  it("leaves out a group with no items now", () => {
    const entries = entriesFor([
      {
        featureId: "first-run",
        id: "first-run.help",
        order: 20,
        title: "First run",
        items: () => [],
      },
    ]);
    expect(entries).toEqual([]);
  });

  it("shows Help just above Settings, and picking an item runs it", () => {
    const picked: string[] = [];
    const container = renderList(entriesFor([firstRun(picked)]), () => {});
    const buttons = [...container.querySelectorAll("nav > button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Help", "Settings"]);
    expect(container.querySelectorAll("nav hr")).toHaveLength(1);
    const help = buttons[0] as HTMLButtonElement;
    expect(help.getAttribute("aria-haspopup")).toBe("menu");
    const menu = document.getElementById(help.getAttribute("popovertarget") ?? "") as HTMLElement;
    expect(menu.textContent).toContain("First run");
    const startOver = [...menu.querySelectorAll("[role=menuitem]")].find(
      (item) => item.textContent === "Start over",
    ) as HTMLElement;
    act(() => startOver.click());
    expect(picked).toEqual(["start-over"]);
  });

  it("shows no Help row when no group has items", () => {
    const container = renderList([], () => {});
    expect([...container.querySelectorAll("nav > button")].map((b) => b.textContent)).toEqual([
      "Settings",
    ]);
  });
});
