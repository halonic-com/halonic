import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { homeLocation, type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { RecentPlaces, recentPlacesKept, withVisit } from "./recent-places.ts";

const agents: TabLocation = { key: "agents", title: "Agents" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

const keys = (places: readonly TabLocation[]) => places.map((place) => place.key);

verifies("shell.palette-wiring", () => {
  it("lists what the active tab showed, the latest first and each once", () => {
    const tabs = new TabSet();
    const recent = new RecentPlaces(tabs);
    tabs.openHere(agents);
    tabs.openHere(reply);
    tabs.back();
    expect(keys(recent.list)).toEqual(["agents", "workflow/acme/reply", "home"]);
  });

  it("counts a tab that becomes active, and not one opened beside it", () => {
    const tabs = new TabSet();
    const recent = new RecentPlaces(tabs);
    const opened = tabs.openInNewTab(agents);
    expect(keys(recent.list)).toEqual(["home"]);
    tabs.activate(opened.tab.id);
    expect(keys(recent.list)).toEqual(["agents", "home"]);
  });

  it("renames a place when its tab is renamed", () => {
    const tabs = new TabSet();
    const recent = new RecentPlaces(tabs);
    tabs.openHere(reply);
    tabs.openHere(agents);
    tabs.rename(reply.key, "Refund reply");
    expect(recent.list.find((place) => place.key === reply.key)?.title).toBe("Refund reply");
  });

  it("tells its listeners only when the list changes, and stops when disposed", () => {
    const tabs = new TabSet();
    const recent = new RecentPlaces(tabs);
    let changes = 0;
    recent.subscribe(() => {
      changes += 1;
    });
    tabs.openHere(agents);
    tabs.openInNewTab(reply);
    expect(changes).toBe(1);
    recent.dispose();
    tabs.openHere(reply);
    expect(keys(recent.list)).toEqual(["agents", "home"]);
  });

  it("keeps the latest places only", () => {
    let list: readonly TabLocation[] = [homeLocation];
    for (let index = 0; index < recentPlacesKept + 5; index += 1) {
      list = withVisit(list, { key: `agent/acme/${index}`, title: `Agent ${index}` });
    }
    expect(list).toHaveLength(recentPlacesKept);
    expect(list[0]?.key).toBe(`agent/acme/${recentPlacesKept + 4}`);
  });
});
