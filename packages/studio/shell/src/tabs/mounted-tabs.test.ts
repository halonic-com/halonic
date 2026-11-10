import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mountedTabIds } from "./mounted-tabs.ts";
import { TabSet } from "./tab-set.ts";

verifies("shell.tab-pages", () => {
  it("keeps the active tab first, then the ones active before it", () => {
    const tabs = new TabSet();
    const first = tabs.state.activeId;
    let mounted = mountedTabIds([], tabs.state);
    const second = tabs.newTab().id;
    mounted = mountedTabIds(mounted, tabs.state);
    expect(mounted).toEqual([second, first]);

    tabs.activate(first);
    expect(mountedTabIds(mounted, tabs.state)).toEqual([first, second]);
  });

  it("drops a closed tab and the tabs past the limit", () => {
    const tabs = new TabSet();
    let mounted = mountedTabIds([], tabs.state);
    const opened = [tabs.state.activeId];
    for (let count = 0; count < 5; count++) {
      opened.push(tabs.newTab().id);
      mounted = mountedTabIds(mounted, tabs.state);
    }
    expect(mounted).toEqual(opened.slice(1).reverse());

    tabs.close(opened[3] as string);
    expect(mountedTabIds(mounted, tabs.state)).not.toContain(opened[3]);
  });

  it("returns the same list when nothing changed", () => {
    const tabs = new TabSet();
    const mounted = mountedTabIds([], tabs.state);
    expect(mountedTabIds(mounted, tabs.state)).toBe(mounted);
  });
});
