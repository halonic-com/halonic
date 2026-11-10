import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { type TabLocation, TabSet, WindowTabStrip } from "../../src/index.ts";

/**
 * The window tab strip in a desktop title bar, over tabs on Agents, Sorter and Support reply with
 * Sorter active: the tabs of the examples in requirements/window-tab-strip.md.
 */
const agents: TabLocation = { key: "agents", title: "Agents" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

const tabs = new TabSet();
tabs.openHere(agents);
tabs.openInNewTab(reply);
tabs.openInNewTab(sorter);
tabs.activate(tabs.state.tabs[1]?.id ?? "");

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The tab strip page needs its #root element (tab-strip.html).");
}
// The title bar's own classes from ShellFrame, so the tabs have their real size and place.
createRoot(root).render(
  <StrictMode>
    <div className="bg-halo-frame px-2 text-fg">
      <header className="flex h-titlebar shrink-0 items-end gap-0.5 ps-1">
        <WindowTabStrip tabs={tabs} />
      </header>
    </div>
  </StrictMode>,
);
