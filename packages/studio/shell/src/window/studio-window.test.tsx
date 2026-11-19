// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import { searchPageLocation } from "../search/search-page-names.ts";
import { serviceKey } from "../service-key.ts";
import { createShell, type Shell } from "../shell.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { PlaceViewProps } from "./studio-page.tsx";
import { type StudioSwitcher, StudioWindow, type WindowActions } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1280);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
});

/** A service only the _inbox_ feature's context can reach. */
const InboxHeading = serviceKey<string>("inbox.heading");

/** The Inbox place's view: its `h1`, worded by a service from its feature's context. */
function InboxView({ context }: PlaceViewProps) {
  return (
    <h1 tabIndex={-1} className="inbox-view">
      {context.services.get(InboxHeading)}
    </h1>
  );
}

const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  provides: [InboxHeading],
  register(studio) {
    studio.services.provide(InboxHeading, () => "Inbox");
    studio.places.add({
      id: "inbox",
      view: "InboxView",
      load: async () => ({ InboxView }),
      signal: () => ({ mark: "count", value: 2, spoken: "2 waiting" }),
    });
  },
});

/** Home's Needs you, as a button that opens the Inbox through its context. */
function OpenInboxCard({ context }: HomeCardProps) {
  return (
    <button type="button" className="open-inbox" onClick={() => context.openPlace?.("inbox")}>
      Open the Inbox
    </button>
  );
}

const openerFeature = defineFeature({
  id: "opener",
  title: "Opener",
  register(studio) {
    studio.home.addCard({
      id: "needs-you",
      view: "OpenInboxCard",
      load: async () => ({ OpenInboxCard }),
    });
  },
});

function renderWindow(
  shell: Shell = createShell({ features: [inboxFeature], timers: new FakeTimers() }),
  switcher?: StudioSwitcher,
) {
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
      switcher={switcher}
    />,
  );
  const link = (name: string) =>
    Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((a) =>
      a.textContent?.startsWith(name),
    );
  return { container, workspace, link };
}

/** Types `words` into a field as a user does, so React's `onChange` sees them. */
function typeInto(field: HTMLInputElement | null, words: string) {
  if (field === null) {
    return;
  }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, words);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.studio-window", () => {
  it("makes a switcher menu given as a function with the window's actions, which run any feature's command", async () => {
    const ran: string[] = [];
    const runner = defineFeature({
      id: "runner",
      title: "Runner",
      register: (studio) =>
        studio.commands.add({ id: "runner.go", title: "Go", run: () => void ran.push("go") }),
    });
    const shell = createShell({ features: [runner], timers: new FakeTimers() });
    let actions: WindowActions | undefined;
    renderWindow(shell, {
      workspace: { name: "Acme", folder: "/work/acme" },
      menu: (given) => {
        actions = given;
        return [];
      },
    });

    let answers: boolean[] = [];
    act(() => {
      answers = [actions?.runCommand("runner.go") ?? false, actions?.runCommand("nope") ?? true];
    });
    await settle();
    expect(answers).toEqual([true, false]);
    expect(ran).toEqual(["go"]);
  });

  it("shows the title bar with its mark, Back and Forward and the window tabs, the sidebar and Home in a new workspace", () => {
    const { container, link } = renderWindow();

    expect(container.querySelector('[role="tablist"][aria-label="Open tabs"]')).not.toBeNull();
    expect(container.querySelector("header")?.textContent).toContain("Halonic Studio");
    expect(container.querySelector('button[aria-label="Back"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Location"]')).toBeNull();
    expect(container.querySelector("footer")?.lastElementChild?.textContent).toContain("Saved");
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
    expect(container.querySelector("main h1")?.textContent).toBe("Home");
    expect(link("Home")?.getAttribute("aria-current")).toBe("page");
  });

  it("lists the places features added after Home, with their signals", () => {
    const { container } = renderWindow();

    const places = Array.from(container.querySelectorAll('nav[aria-label="Places"] a'));
    expect(places.map((place) => place.textContent)).toEqual(["Home", "Inbox2, 2 waiting"]);
  });

  it("opens a place's view in the active tab, with its feature's context", async () => {
    const { container, workspace, link } = renderWindow();

    act(() => link("Inbox")?.click());
    await settle();

    expect(currentLocation(workspace.tabs.active).key).toBe("inbox");
    expect(container.querySelector("main h1.inbox-view")?.textContent).toBe("Inbox");
  });

  it("moves focus to the h1 of a place whose view loads after the click, every time", async () => {
    const { container, link } = renderWindow();
    const back = () => container.querySelector<HTMLButtonElement>('button[aria-label="Back"]');

    act(() => link("Inbox")?.click());
    expect(container.querySelector("main h1.inbox-view")).toBeNull();
    await settle();
    expect(document.activeElement?.className).toBe("inbox-view");

    act(() => link("Home")?.click());
    act(() => back()?.click());
    await settle();
    expect(document.activeElement?.className).toBe("inbox-view");
  });

  it("lets a view open a place in the active tab, as the sidebar does", async () => {
    const { container, workspace } = renderWindow(
      createShell({ features: [inboxFeature, openerFeature], timers: new FakeTimers() }),
    );
    await settle();

    act(() => container.querySelector<HTMLButtonElement>("button.open-inbox")?.click());
    await settle();

    expect(workspace.tabs.state.tabs).toHaveLength(1);
    expect(currentLocation(workspace.tabs.active)).toEqual({ key: "inbox", title: "Inbox" });
    expect(container.querySelector("main h1.inbox-view")?.textContent).toBe("Inbox");
  });

  it("moves focus to the h1 of a place a view opens, once its view loads", async () => {
    const { container } = renderWindow(
      createShell({ features: [inboxFeature, openerFeature], timers: new FakeTimers() }),
    );
    await settle();

    act(() => container.querySelector<HTMLButtonElement>("button.open-inbox")?.click());
    expect(container.querySelector("main h1.inbox-view")).toBeNull();
    await settle();

    expect(document.activeElement?.className).toBe("inbox-view");
  });

  it("shows the Search page for a tab on a search", () => {
    const { container, workspace } = renderWindow();

    act(() => workspace.tabs.openHere(searchPageLocation("refund")));

    expect(currentLocation(workspace.tabs.active).title).toBe("Search: refund");
    expect(
      container.querySelector<HTMLInputElement>('main input[aria-label="Search words"]')?.value,
    ).toBe("refund");
  });

  it("opens the Ctrl K palette from the sidebar's Search box", () => {
    const { container } = renderWindow();
    expect(container.querySelector("dialog[open]")).toBeNull();

    const search = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-keyshortcuts") === "Control+K",
    );
    act(() => search?.click());

    expect(container.querySelector('dialog[open][aria-label="Search"]')).not.toBeNull();
  });

  it("moves focus to the h1 of a page the Ctrl K palette opens here, not back to Search", async () => {
    const { container, link } = renderWindow();
    // Inbox goes into Recent, so the palette finds it by name.
    act(() => link("Inbox")?.click());
    await settle();
    act(() => link("Home")?.click());
    await settle();

    const search = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-keyshortcuts") === "Control+K",
    );
    act(() => {
      search?.focus();
      search?.click();
    });
    const box = () => container.querySelector<HTMLInputElement>('[role="combobox"]');
    act(() => typeInto(box(), "Inbox"));
    await settle();
    act(() => {
      box()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();

    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement?.className).toBe("inbox-view");
  });

  it("opens a new tab on Home with the palette over it from +", () => {
    const { container, workspace } = renderWindow();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="New tab"]')?.click());

    expect(workspace.tabs.state.tabs).toHaveLength(2);
    expect(currentLocation(workspace.tabs.active).key).toBe("home");
    expect(container.querySelector('dialog[open][aria-label="Search"]')).not.toBeNull();
  });

  it("stops following the tabs for Recent once the workspace is disposed", () => {
    const { workspace } = renderWindow();
    act(() => workspace.tabs.openHere({ key: "inbox", title: "Inbox" }));
    expect(workspace.recent.list.map((place) => place.key)).toContain("inbox");

    workspace.dispose();
    act(() => workspace.tabs.openHere(searchPageLocation("refund")));

    expect(workspace.recent.list.map((place) => place.key)).not.toContain(
      searchPageLocation("refund").key,
    );
  });

  describe("when Settings closes", () => {
    const settingsRow = (container: HTMLElement) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Settings",
      );
    const places = (container: HTMLElement) =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Places"]');
    const pressEscape = (container: HTMLElement) =>
      act(() => {
        container
          .querySelector("dialog[open]")
          ?.dispatchEvent(new Event("cancel", { cancelable: true }));
      });

    it("gives the focus back to the sidebar's Settings row in a wide window", () => {
      const { container } = renderWindow();
      act(() => settingsRow(container)?.focus());
      act(() => settingsRow(container)?.click());
      expect(container.querySelector("dialog[open]")).not.toBeNull();

      pressEscape(container);

      expect(container.querySelector("dialog[open]")).toBeNull();
      expect(document.activeElement).toBe(settingsRow(container));
    });

    it("gives the focus back to the Places button when it opened from the narrow drawer", () => {
      act(() => media.resize(700));
      const { container } = renderWindow();
      act(() => places(container)?.click());
      act(() => settingsRow(container)?.focus());
      act(() => settingsRow(container)?.click());
      // The dialog takes the focus, so the drawer closes and hides its row.
      act(() => container.querySelector<HTMLElement>("dialog[open] button")?.focus());
      expect(places(container)?.getAttribute("aria-expanded")).toBe("false");

      pressEscape(container);

      expect(container.querySelector("dialog[open]")).toBeNull();
      expect(document.activeElement).toBe(places(container));
    });
  });
});

verifies("shell.sidebar-view-request", () => {
  /** The context the last drawn Home card got, so a test can call what the window gave it. */
  let seen: WorkspaceContext | undefined;

  function SeeContextCard({ context }: HomeCardProps) {
    seen = context;
    return <p>Seen</p>;
  }

  const filesFeature = defineFeature({
    id: "files",
    title: "Files",
    register(studio) {
      studio.sidebarViews.add({
        id: "files",
        order: 10,
        label: "Files",
        view: "FilesView",
        load: async () => ({ FilesView: () => <p className="file-tree">The file tree</p> }),
      });
      studio.home.addCard({
        id: "cards",
        view: "SeeContextCard",
        load: async () => ({ SeeContextCard }),
      });
    },
  });

  function renderWithFiles() {
    seen = undefined;
    return renderWindow(createShell({ features: [filesFeature], timers: new FakeTimers() }));
  }

  const viewTab = (container: HTMLElement, name: string) =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        '[role="tablist"][aria-label="Sidebar view"] [role="tab"]',
      ),
    ).find((tab) => tab.textContent?.startsWith(name) === true);
  const selectedView = (container: HTMLElement) =>
    ["Studio", "Files"].find(
      (name) => viewTab(container, name)?.getAttribute("aria-selected") === "true",
    );

  it("shows the view a feature asks for, and the places again for studio", async () => {
    const { container } = renderWithFiles();
    await settle();
    expect(selectedView(container)).toBe("Studio");

    act(() => seen?.showSidebarView?.("files"));
    await settle();

    expect(selectedView(container)).toBe("Files");
    expect(container.querySelector(".file-tree")).not.toBeNull();

    act(() => seen?.showSidebarView?.("studio"));

    expect(selectedView(container)).toBe("Studio");
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
  });

  it("changes nothing for a view no feature added", async () => {
    const { container } = renderWithFiles();
    await settle();

    expect(() => act(() => seen?.showSidebarView?.("notes"))).not.toThrow();

    expect(selectedView(container)).toBe("Studio");
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
  });

  it("keeps the tab the user picks, as the switch did on its own", async () => {
    const { container } = renderWithFiles();
    await settle();

    act(() => viewTab(container, "Files")?.click());
    await settle();

    expect(selectedView(container)).toBe("Files");
    expect(container.querySelector(".file-tree")).not.toBeNull();
  });

  it("gives a phone's context no showSidebarView", async () => {
    media.resize(400);
    renderWithFiles();
    await settle();

    expect(seen).toBeDefined();
    expect(seen?.showSidebarView).toBeUndefined();
  });
});
