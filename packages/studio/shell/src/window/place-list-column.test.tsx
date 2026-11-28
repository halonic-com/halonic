// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { PlaceSlotProps } from "../points/frame.ts";
import { createShell, type Shell } from "../shell.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PlaceOpenItems } from "./place-open-items.ts";
import type { PlaceListPageProps } from "./studio-page.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let media: FakeMediaQueries | undefined;
let restoreMedia: (() => void) | undefined;
let restoreModal: () => void;

beforeEach(() => {
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia?.();
  restoreMedia = undefined;
});

/** The Changes list as a feature draws it: one row per change, which opens it. */
function ChangesList({ open, setOpen }: PlaceSlotProps) {
  return (
    <nav aria-label="Changes list" data-open={open ?? ""}>
      {["instructions", "skill"].map((id) => (
        <button key={id} type="button" className={id} onClick={() => setOpen(id)}>
          {id}
        </button>
      ))}
    </nav>
  );
}

/** The Changes page: its own list only while the window doesn't draw it, then the open change. */
function ChangesPage(props: PlaceListPageProps) {
  return (
    <section className="changes-page" data-in-frame={String(props.listInFrame)}>
      {props.listInFrame ? null : <ChangesList {...props} />}
      <p className="opened">{props.open ?? "none"}</p>
    </section>
  );
}

const changesFeature = defineFeature({
  id: "changes",
  title: "Changes",
  register(studio) {
    studio.places.add({
      id: "changes",
      view: "ChangesPage",
      load: async () => ({ ChangesPage }),
      listColumn: { view: "ChangesList", load: async () => ({ ChangesList }) },
    });
  },
});

/** Draws the window at `width` on Changes, and lets the views load. */
async function renderOnChanges(width: number) {
  media = new FakeMediaQueries(width);
  restoreMedia = media.install();
  const shell: Shell = createShell({ features: [changesFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  workspace.tabs.openHere({ key: "changes", title: "Changes" });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  await settle();
  await settle();
  return { container, tabs: workspace.tabs };
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function listsIn(element: Element | null | undefined): number {
  return element?.querySelectorAll('nav[aria-label="Changes list"]').length ?? 0;
}

verifies("shell.rail-frame", () => {
  it("shows the place's own list in the window's list column, and none in the page, from 900px", async () => {
    const { container } = await renderOnChanges(1280);
    const column = container.querySelector('[data-place-list="changes"]');
    expect(column?.closest("main")).toBeNull();
    expect(listsIn(column)).toBe(1);
    expect(listsIn(container)).toBe(1);
    expect(container.querySelector('nav[aria-label="Places"]')).toBeNull();
    expect(container.querySelector(".changes-page")?.getAttribute("data-in-frame")).toBe("true");
  });

  it("opens in the page the row picked in the window's list column", async () => {
    const { container } = await renderOnChanges(1280);
    const column = container.querySelector('[data-place-list="changes"]');
    await act(async () => column?.querySelector<HTMLElement>(".skill")?.click());
    expect(container.querySelector(".opened")?.textContent).toBe("skill");
  });

  it("keeps the places in the Places drawer under 900px, where the page draws its own list", async () => {
    const { container } = await renderOnChanges(800);
    expect(container.querySelector("[data-place-list]")).toBeNull();
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
    expect(listsIn(container.querySelector("main"))).toBe(1);
    expect(container.querySelector(".changes-page")?.getAttribute("data-in-frame")).toBe("false");
  });

  it("keeps what's open when the window crosses 900px and back", async () => {
    const { container } = await renderOnChanges(1280);
    const column = container.querySelector('[data-place-list="changes"]');
    await act(async () => column?.querySelector<HTMLElement>(".skill")?.click());
    act(() => media?.resize(800));
    expect(container.querySelector(".opened")?.textContent).toBe("skill");
    expect(container.querySelector("main nav")?.getAttribute("data-open")).toBe("skill");
    act(() => media?.resize(1280));
    await settle();
    expect(container.querySelector(".opened")?.textContent).toBe("skill");
    const list = container.querySelector('[data-place-list="changes"] nav');
    expect(list?.getAttribute("data-open")).toBe("skill");
  });

  it("shows the places while the active tab is on a place without its own list", async () => {
    const { container, tabs } = await renderOnChanges(1280);
    act(() => tabs.openHere({ key: "home", title: "Home" }));
    await settle();
    expect(container.querySelector("[data-place-list]")).toBeNull();
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
  });

  it("keeps an open item for each tab, and drops a tab's when it closes", () => {
    const tabs = new TabSet();
    tabs.openHere({ key: "changes", title: "Changes" });
    const first = tabs.active.id;
    const second = tabs.openInNewTab({ key: "changes/all", title: "All" }).tab.id;
    const open = new PlaceOpenItems(tabs);
    open.set(first, "changes", "skill");
    open.set(second, "changes", "instructions");
    expect(open.get(first, "changes")).toBe("skill");
    expect(open.get(second, "changes")).toBe("instructions");
    tabs.close(second);
    expect(open.get(second, "changes")).toBeUndefined();
    expect(open.get(first, "changes")).toBe("skill");
  });
});
