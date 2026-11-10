import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  currentLocation,
  homeLocation,
  reopenableTabs,
  type TabLocation,
  TabSet,
} from "./tab-set.ts";

const agents: TabLocation = { key: "agents", title: "Agents" };
const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter" };
const writer: TabLocation = { key: "agent/acme/writer", title: "Writer" };
const supportReply: TabLocation = { key: "workflow/acme/support-reply", title: "Support reply" };

/** The strip as the user reads it: each tab's title, the active one marked with `*`. */
function strip(tabs: TabSet): string[] {
  return tabs.state.tabs.map((tab) => {
    const title = currentLocation(tab).title;
    return tab.id === tabs.state.activeId ? `*${title}` : title;
  });
}

/** Tabs on the given places, in order, with the first one active. */
function tabsOn(...places: TabLocation[]): TabSet {
  const tabs = new TabSet();
  const [first, ...rest] = places;
  if (first !== undefined) {
    tabs.openHere(first);
  }
  for (const place of rest.reverse()) {
    tabs.openInNewTab(place);
  }
  return tabs;
}

verifies("shell.tab-set", () => {
  it("starts with one tab on Home", () => {
    expect(strip(new TabSet())).toEqual(["*Home"]);
  });

  it("gives each tab its own Back and Forward", () => {
    const tabs = new TabSet();
    tabs.openHere(agents);
    tabs.openHere(sorter);
    expect(tabs.back()).toBe(true);
    expect(strip(tabs)).toEqual(["*Agents"]);
    expect(tabs.forward()).toBe(true);
    expect(strip(tabs)).toEqual(["*Sorter"]);
    expect(tabs.forward()).toBe(false);

    tabs.newTab();
    expect(tabs.back()).toBe(false);
  });

  it("goes Back and Forward exactly one place, even to a place another tab shows", () => {
    const tabs = new TabSet();
    tabs.openHere(agents);
    tabs.openHere(sorter);
    tabs.openInNewTab(agents);
    expect(tabs.back()).toBe(true);
    expect(strip(tabs)).toEqual(["*Agents", "Agents"]);
    expect(tabs.back()).toBe(true);
    expect(strip(tabs)).toEqual(["*Home", "Agents"]);
    expect(tabs.back()).toBe(false);
    expect(tabs.forward()).toBe(true);
    expect(strip(tabs)).toEqual(["*Agents", "Agents"]);
  });

  it("goes Back to Home while another tab is on Home", () => {
    const tabs = new TabSet();
    tabs.openHere(sorter);
    tabs.newTab();
    tabs.activateAt(0);
    expect(tabs.back()).toBe(true);
    expect(strip(tabs)).toEqual(["*Home", "Home"]);
  });

  it("tells whether the active tab can go Back and Forward", () => {
    const tabs = new TabSet();
    expect(tabs.state).toMatchObject({ canGoBack: false, canGoForward: false });
    tabs.openHere(agents);
    expect(tabs.state).toMatchObject({ canGoBack: true, canGoForward: false });
    tabs.back();
    expect(tabs.state).toMatchObject({ canGoBack: false, canGoForward: true });
    tabs.newTab();
    expect(tabs.state).toMatchObject({ canGoBack: false, canGoForward: false });
    tabs.activateAt(0);
    expect(tabs.state).toMatchObject({ canGoBack: false, canGoForward: true });
  });

  it("does nothing when the place the active tab shows is opened here", () => {
    const tabs = new TabSet();
    tabs.openHere(homeLocation);
    expect(tabs.active.history).toEqual([homeLocation]);
    tabs.openHere(agents);
    const before = tabs.state;
    tabs.openHere(agents);
    expect(tabs.state).toBe(before);
    expect(tabs.back()).toBe(true);
    expect(tabs.back()).toBe(false);
  });

  it("prefers the active tab when it and another tab show the place being opened", () => {
    const tabs = new TabSet();
    tabs.openHere(agents);
    tabs.openHere(sorter);
    tabs.openInNewTab(agents);
    tabs.back();
    expect(strip(tabs)).toEqual(["*Agents", "Agents"]);
    const active = tabs.active;
    tabs.openHere(agents);
    expect(tabs.active).toBe(active);
    expect(tabs.openInNewTab(agents)).toEqual({ tab: active, added: false });
    expect(tabs.active.position).toBe(1);
  });

  it("drops Forward when a place opens after going back", () => {
    const tabs = new TabSet();
    tabs.openHere(agents);
    tabs.openHere(sorter);
    tabs.back();
    tabs.openHere(workflows);
    expect(strip(tabs)).toEqual(["*Workflows"]);
    expect(tabs.forward()).toBe(false);
    tabs.back();
    expect(strip(tabs)).toEqual(["*Agents"]);
  });

  it("switches to the tab that already shows a place instead of opening a copy", () => {
    const tabs = tabsOn(agents, supportReply);
    tabs.openHere(supportReply);
    expect(strip(tabs)).toEqual(["Agents", "*Support reply"]);
    expect(tabs.state.tabs).toHaveLength(2);
  });

  it("tells whether a new tab was added or a tab already showed the place", () => {
    const tabs = tabsOn(agents, supportReply);
    const before = tabs.state;
    expect(tabs.openInNewTab(supportReply)).toEqual({ tab: tabs.state.tabs[1], added: false });
    expect(tabs.state).toBe(before);
    const opened = tabs.openInNewTab(sorter);
    expect(opened).toEqual({ tab: tabs.state.tabs[1], added: true });
    expect(strip(tabs)).toEqual(["*Agents", "Sorter", "Support reply"]);
  });

  it("lets several tabs show Home", () => {
    const tabs = new TabSet();
    tabs.newTab();
    tabs.openHere(homeLocation);
    expect(strip(tabs)).toEqual(["Home", "*Home"]);
  });

  it("opens a new tab right after the active one and keeps the active tab", () => {
    const tabs = tabsOn(agents, writer);
    tabs.openInNewTab(sorter);
    expect(strip(tabs)).toEqual(["*Agents", "Sorter", "Writer"]);
  });

  it("opens + on Home at the end of the strip, active", () => {
    const tabs = tabsOn(agents, sorter);
    tabs.newTab();
    expect(strip(tabs)).toEqual(["Agents", "Sorter", "*Home"]);
  });

  it("activates the tab to the right of a closed active tab, else the one to its left", () => {
    const tabs = tabsOn(agents, sorter, writer);
    tabs.activateAt(1);
    tabs.close(tabs.active.id);
    expect(strip(tabs)).toEqual(["Agents", "*Writer"]);
    tabs.close(tabs.active.id);
    expect(strip(tabs)).toEqual(["*Agents"]);
  });

  it("keeps the active tab when another tab closes", () => {
    const tabs = tabsOn(agents, sorter);
    tabs.close(tabs.state.tabs[1]?.id ?? "");
    expect(strip(tabs)).toEqual(["*Agents"]);
  });

  it("leaves one tab on Home when the last tab closes", () => {
    const tabs = tabsOn(sorter);
    tabs.close(tabs.active.id);
    expect(strip(tabs)).toEqual(["*Home"]);
  });

  it("brings back the last closed tab with its history in its old place", () => {
    const tabs = tabsOn(agents, sorter, writer);
    tabs.activateAt(1);
    tabs.openHere(supportReply);
    tabs.close(tabs.active.id);
    tabs.reopenClosed();
    expect(strip(tabs)).toEqual(["Agents", "*Support reply", "Writer"]);
    tabs.back();
    expect(strip(tabs)).toEqual(["Agents", "*Sorter", "Writer"]);
  });

  it("switches to the tab that shows a closed tab's place by now instead of reopening it", () => {
    const tabs = tabsOn(sorter, agents);
    tabs.close(tabs.active.id);
    tabs.openHere(sorter);
    tabs.reopenClosed();
    expect(strip(tabs)).toEqual(["*Sorter"]);
  });

  it(`remembers the last ${reopenableTabs} closed tabs`, () => {
    const tabs = new TabSet();
    for (let count = 0; count < reopenableTabs + 5; count += 1) {
      tabs.openInNewTab({ key: `agent/acme/a${count}`, title: `A${count}` });
      tabs.close(tabs.state.tabs[1]?.id ?? "");
    }
    for (let count = 0; count < reopenableTabs + 5; count += 1) {
      tabs.reopenClosed();
    }
    expect(tabs.state.tabs).toHaveLength(reopenableTabs + 1);
  });

  it("moves a tab anywhere in the strip", () => {
    const tabs = tabsOn(agents, sorter, writer);
    tabs.move(tabs.state.tabs[2]?.id ?? "", 0);
    expect(strip(tabs)).toEqual(["Writer", "*Agents", "Sorter"]);
    tabs.move(tabs.state.tabs[0]?.id ?? "", 99);
    expect(strip(tabs)).toEqual(["*Agents", "Sorter", "Writer"]);
  });

  it("cycles through the tabs with wrap-around and activates by position", () => {
    const tabs = tabsOn(agents, sorter, writer);
    tabs.cycle(-1);
    expect(strip(tabs)).toEqual(["Agents", "Sorter", "*Writer"]);
    tabs.cycle(1);
    expect(strip(tabs)).toEqual(["*Agents", "Sorter", "Writer"]);
    tabs.activateAt(-1);
    expect(strip(tabs)).toEqual(["Agents", "Sorter", "*Writer"]);
    tabs.activateAt(7);
    expect(strip(tabs)).toEqual(["Agents", "Sorter", "*Writer"]);
  });

  it("shows a renamed place's new title in every tab and history", () => {
    const mailTriage = { key: "agent/acme/mail-triage", title: "Mail triage", kind: "agent" };
    const tabs = tabsOn(mailTriage);
    tabs.openHere(writer);
    tabs.newTab();
    tabs.openHere(mailTriage);
    tabs.rename(mailTriage.key, "Triage");
    expect(strip(tabs)).toEqual(["Writer", "*Triage"]);
    const behindWriter = tabs.state.tabs[0]?.history.map((place) => place.title);
    expect(behindWriter).toEqual(["Home", "Triage", "Writer"]);
    expect(tabs.active.history[1]).toEqual({ ...mailTriage, title: "Triage" });
  });

  it("brings back a closed tab with a place's new title", () => {
    const mailTriage = { key: "agent/acme/mail-triage", title: "Mail triage", kind: "agent" };
    const tabs = tabsOn(agents, mailTriage);
    tabs.close(tabs.state.tabs[1]?.id ?? "");
    tabs.rename(mailTriage.key, "Triage");
    tabs.reopenClosed();
    expect(strip(tabs)).toEqual(["Agents", "*Triage"]);
  });

  it("tells subscribers about every change with a new state", () => {
    const tabs = new TabSet();
    const before = tabs.state;
    let changes = 0;
    const stop = tabs.subscribe(() => {
      changes += 1;
    });
    tabs.openHere(agents);
    tabs.activate(tabs.active.id);
    tabs.move(tabs.active.id, 0);
    tabs.rename(agents.key, agents.title);
    tabs.rename(sorter.key, "Sorter 2");
    stop();
    tabs.openHere(sorter);
    expect(changes).toBe(1);
    expect(tabs.state).not.toBe(before);
  });
});
