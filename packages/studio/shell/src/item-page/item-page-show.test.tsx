// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeResizeObserver } from "../test-support/fake-resize-observer.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  ItemPage,
  type ItemPageChat,
  type ItemPageHandle,
  type ItemPageProps,
} from "./item-page.tsx";
import { TabPageContext, ViewMemory } from "./remembered-view.ts";

type View = "runs" | "configuration";

const views: ItemPageProps<View>["views"] = [
  { id: "runs", label: "Runs" },
  { id: "configuration", label: "Configuration" },
];

const agentChat: ItemPageChat = {
  startsOpen: true,
  render: () => <p>Chat with Sorter</p>,
};

let uninstallPopover: () => void;
let uninstallResizeObserver: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
  uninstallResizeObserver = FakeResizeObserver.install();
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  uninstallResizeObserver();
  vi.restoreAllMocks();
});

function renderAgent(
  props: Partial<ItemPageProps<View>> = {},
  memory = new ViewMemory(),
): readonly [HTMLElement, ItemPageHandle<View>] {
  const handle = createRef<ItemPageHandle<View>>();
  const tab = { tabId: "tab-1", locationKey: "agent/acme/sorter", views: memory };
  const container = render(
    <TabPageContext value={tab}>
      <ItemPage<View>
        icon={<svg />}
        kind="Agent"
        name="Sorter"
        onRename={() => {}}
        views={views}
        chat={agentChat}
        handle={handle}
        {...props}
      >
        {(view) => (
          <>
            <h2 tabIndex={-1}>{view} heading</h2>
            <p>{view} view</p>
          </>
        )}
      </ItemPage>
    </TabPageContext>,
  );
  if (handle.current === null) throw new Error("ItemPage gave no handle");
  return [container, handle.current];
}

function panel(container: HTMLElement): HTMLElement {
  return container.querySelector('[role="tabpanel"]') as HTMLElement;
}

/** The box the panel's view is drawn in, hidden while the panel is. */
function panelBox(container: HTMLElement): HTMLElement {
  return panel(container).parentElement as HTMLElement;
}

function press(container: HTMLElement, name: string): void {
  const control = [...container.querySelectorAll("button")].find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name,
  );
  act(() => control?.click());
}

verifies("shell.item-page-header", () => {
  it("opens on the page's first view, and hears the user's picks", () => {
    const picked: View[] = [];
    const [container] = renderAgent({
      firstView: "configuration",
      onPickView: (view) => picked.push(view),
    });
    expect(panel(container).textContent).toContain("configuration view");
    const runs = [...container.querySelectorAll<HTMLElement>('header [role="tab"]')].find((tab) =>
      tab.textContent?.startsWith("Runs"),
    );
    act(() => runs?.click());
    expect(picked).toEqual(["runs"]);
    expect(panel(container).textContent).toContain("runs view");
  });

  it("shows a view the page asks for and moves focus to it", () => {
    const [container, page] = renderAgent();
    act(() => page.show("configuration"));
    expect(panel(container).textContent).toContain("configuration view");
    expect(document.activeElement).toBe(panelBox(container));
  });

  it("moves focus to the element the page names once the view is drawn", () => {
    const [container, page] = renderAgent();
    act(() => page.show("configuration", () => container.querySelector("h2")));
    expect(document.activeElement?.textContent).toBe("configuration heading");
  });

  it("reopens a panel the user closed to show a view", () => {
    const [container, page] = renderAgent();
    press(container, "Close Runs");
    expect(panelBox(container).hidden).toBe(true);
    act(() => page.show("configuration"));
    expect(panelBox(container).hidden).toBe(false);
    expect(panel(container).textContent).toContain("configuration view");
    expect(document.activeElement).toBe(panelBox(container));
  });

  it("opens the panel's own screen to show a view in a narrow tab", () => {
    FakeResizeObserver.width = 800;
    const [container, page] = renderAgent();
    expect(panelBox(container).hidden).toBe(true);
    act(() => page.show("configuration"));
    expect(panelBox(container).hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('section[aria-label="Chat"]')?.hidden).toBe(true);
    expect(document.activeElement).toBe(panelBox(container));
  });

  it("remembers a view the page showed for its tab, as a pick", () => {
    const memory = new ViewMemory();
    const [, page] = renderAgent({}, memory);
    act(() => page.show("configuration"));
    expect(memory.get("tab-1", "agent/acme/sorter")).toBe("configuration");
  });
});
