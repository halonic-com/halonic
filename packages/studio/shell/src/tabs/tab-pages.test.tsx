// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { focusPageHeading } from "./history-moves.ts";
import { TabPages, type TabPagesProps } from "./tab-pages.tsx";
import { currentLocation, type TabLocation, TabSet } from "./tab-set.ts";

const agents: TabLocation = { key: "agents", title: "Agents" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

/** A page with its title as the `h1`, one field to type into and a `tablist` of its own. */
function Page({ location }: { readonly location: TabLocation }) {
  return (
    <>
      <h1>{location.title}</h1>
      <input aria-label={`Notes on ${location.title}`} />
      <div role="tablist" aria-label={`Sections of ${location.title}`}>
        <button type="button" role="tab">
          Overview
        </button>
      </div>
    </>
  );
}

/**
 * Tabs on Agents and Sorter, Agents active, with their pages in `main` and a tab strip stand-in.
 * `pages` can change how a page draws and which items are gone.
 */
function renderPages(pages: Partial<Pick<TabPagesProps, "renderPage" | "goneItem">> = {}) {
  const tabs = new TabSet();
  tabs.openHere(agents);
  tabs.openInNewTab(sorter);
  const container = render(
    <>
      <div role="tablist" aria-label="Open tabs" data-window-tab-strip="">
        <button type="button" role="tab">
          Agents
        </button>
      </div>
      <main>
        <TabPages tabs={tabs} renderPage={(location) => <Page location={location} />} {...pages} />
      </main>
    </>,
  );
  const [first, second] = tabs.state.tabs.map((tab) => tab.id) as [string, string];
  const page = (tabId: string) =>
    container.querySelector<HTMLElement>(`[data-tab-page="${tabId}"]`);
  const field = (title: string) =>
    container.querySelector<HTMLInputElement>(`input[aria-label="Notes on ${title}"]`);
  const pageTab = (title: string) =>
    container.querySelector<HTMLElement>(`[aria-label="Sections of ${title}"] [role="tab"]`);
  return { tabs, container, first, second, page, field, pageTab };
}

verifies("shell.tab-pages", () => {
  it("keeps a page the user left mounted, hidden and inert, with its typed text and focus", () => {
    const { tabs, first, second, page, field } = renderPages();
    const notes = field("Agents") as HTMLInputElement;
    notes.value = "half a thought";
    act(() => notes.focus());

    act(() => tabs.activate(second));
    expect(page(first)?.hidden).toBe(true);
    expect(page(first)?.hasAttribute("inert")).toBe(true);
    expect(document.activeElement?.textContent).toBe("Sorter");

    act(() => tabs.activate(first));
    expect(page(first)?.hidden).toBe(false);
    expect(field("Agents")).toBe(notes);
    expect(notes.value).toBe("half a thought");
    expect(document.activeElement).toBe(notes);
  });

  it("gives a page back its scroll position", () => {
    const { tabs, first, second, page } = renderPages();
    const agentsPage = page(first) as HTMLElement;
    agentsPage.scrollTop = 300;
    act(() => {
      agentsPage.dispatchEvent(new Event("scroll"));
    });
    act(() => tabs.activate(second));
    agentsPage.scrollTop = 0;
    act(() => tabs.activate(first));
    expect(agentsPage.scrollTop).toBe(300);
  });

  it("draws a page afresh once five more recently active tabs push it out", () => {
    const { tabs, first, page, field } = renderPages();
    const notes = field("Agents") as HTMLInputElement;
    notes.value = "gone soon";
    act(() => notes.focus());
    for (let count = 0; count < 5; count++) {
      act(() => {
        tabs.newTab();
      });
    }
    expect(page(first)).toBeNull();

    act(() => tabs.activate(first));
    expect(field("Agents")?.value).toBe("");
    expect(document.activeElement?.textContent).toBe("Agents");
  });

  it("draws a fresh page, at the top, when the tab moves on to another place", () => {
    const { tabs, first, page, field } = renderPages();
    const agentsPage = page(first) as HTMLElement;
    const notes = field("Agents") as HTMLInputElement;
    notes.value = "about agents";
    agentsPage.scrollTop = 300;
    act(() => {
      agentsPage.dispatchEvent(new Event("scroll"));
    });

    act(() => tabs.openHere({ key: "routines", title: "Routines" }));
    expect(agentsPage.scrollTop).toBe(0);

    agentsPage.scrollTop = 200;
    act(() => tabs.back());
    expect(field("Agents")?.value).toBe("");
    expect(agentsPage.scrollTop).toBe(0);
  });

  it("leaves the focus in the tab strip", () => {
    const { tabs, container, second } = renderPages();
    const tab = container.querySelector<HTMLElement>('[role="tab"]') as HTMLElement;
    act(() => tab.focus());
    act(() => tabs.activate(second));
    expect(document.activeElement).toBe(tab);
  });

  it("moves the focus off a tablist on the page it leaves", () => {
    const { tabs, second, pageTab } = renderPages();
    act(() => pageTab("Agents")?.focus());
    act(() => tabs.activate(second));
    expect(document.activeElement?.textContent).toBe("Sorter");
  });

  it("finds only the shown page's h1", () => {
    const { tabs, second } = renderPages();
    act(() => tabs.activate(second));
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    focusPageHeading();
    expect(document.activeElement?.textContent).toBe("Sorter");
  });
});

verifies("shell.page-stopped", () => {
  it("stops only the page that throws, and draws the next place in its tab afresh", () => {
    // React logs every error a boundary catches; here the failure is the point.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tabs, first, second, page } = renderPages({
      renderPage: (location) => <BrokenOn location={location} broken={sorter.key} />,
    });

    act(() => tabs.activate(second));
    expect(page(second)?.querySelector("h2")?.textContent).toBe("This page stopped working");
    expect(page(second)?.textContent).toContain("Halonic ran into a problem showing Sorter.");

    act(() => tabs.activate(first));
    expect(page(first)?.querySelector("h1")?.textContent).toBe("Agents");

    act(() => tabs.activate(second));
    act(() => tabs.openHere({ key: "routines", title: "Routines" }));
    expect(page(second)?.querySelector("h1")?.textContent).toBe("Routines");
  });
});

verifies("shell.item-gone", () => {
  it("shows that a tab's item is gone, and Go to opens the place that lists its kind", () => {
    const { tabs, second, page } = renderPages({
      goneItem: (location) =>
        location.key === sorter.key ? { kindName: "agent", place: agents } : undefined,
    });

    act(() => tabs.activate(second));
    const title = page(second)?.querySelector("h2");
    expect(title?.textContent).toBe("This agent isn't in this workspace any more.");
    expect(document.activeElement).toBe(title);

    const goTo = page(second)?.querySelector("button") as HTMLButtonElement;
    expect(goTo.textContent).toBe("Go to Agents");
    act(() => goTo.click());
    expect(currentLocation(tabs.active).key).toBe(agents.key);
  });
});

/** A {@link Page} that throws while it draws when it shows the place `broken`. */
function BrokenOn({
  location,
  broken,
}: {
  readonly location: TabLocation;
  readonly broken: string;
}) {
  if (location.key === broken) {
    throw new TypeError("steps is undefined");
  }
  return <Page location={location} />;
}
