// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";
import { windowTitle } from "./window-title.ts";

/** A phone's width, under `PHONE_MAX_WIDTH`. */
const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(DESKTOP_WIDTH);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
  document.title = "";
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
  window.history.replaceState(null, "");
});

const supportReply = {
  key: "workflow/acme/support-reply",
  title: "Support reply",
  kind: "workflow",
};

/** Shows a Studio window for a workspace named `name`, or with no name. */
function renderWindow(name?: string) {
  const shell = createShell({ features: [], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  const tapPlace = (name: string) =>
    act(() =>
      container
        .querySelector<HTMLElement>(`nav[aria-label="Places"] a[aria-label^="${name}"]`)
        ?.click(),
    );
  return { tabs: workspace.tabs, tapPlace };
}

verifies("shell.window-title", () => {
  it("joins the page, the workspace and the app", () => {
    expect(windowTitle("Home", "Acme")).toBe("Home · Acme · Halonic");
    expect(windowTitle("Home")).toBe("Home · Halonic");
  });

  it("treats an empty workspace name like no name", () => {
    expect(windowTitle("Home", "")).toBe("Home · Halonic");
    expect(windowTitle("Home", "  ")).toBe("Home · Halonic");
  });

  it("names Home and the workspace in a new window", () => {
    renderWindow("Acme");
    expect(document.title).toBe("Home · Acme · Halonic");
  });

  it("leaves the workspace out while the window doesn't know its name", () => {
    renderWindow();
    expect(document.title).toBe("Home · Halonic");
  });

  it("follows the active tab to another place and Back", () => {
    const { tabs } = renderWindow("Acme");
    act(() => tabs.openHere({ key: "inbox", title: "Inbox" }));
    expect(document.title).toBe("Inbox · Acme · Halonic");
    act(() => tabs.back());
    expect(document.title).toBe("Home · Acme · Halonic");
  });

  it("follows a switch to another tab", () => {
    const { tabs } = renderWindow("Acme");
    act(() => tabs.openInNewTab(supportReply));
    expect(document.title).toBe("Home · Acme · Halonic");
    const opened = tabs.state.tabs[1];
    act(() => tabs.activate(opened?.id ?? ""));
    expect(document.title).toBe("Support reply · Acme · Halonic");
  });

  it("follows a rename of the shown item", () => {
    const { tabs } = renderWindow("Acme");
    act(() => tabs.openHere(supportReply));
    act(() => tabs.rename(supportReply.key, "Refund reply"));
    expect(document.title).toBe("Refund reply · Acme · Halonic");
  });

  it("names the phone's page on a phone, and the active tab's again on the desktop", () => {
    const { tabs, tapPlace } = renderWindow("Acme");
    act(() => tabs.openHere(supportReply));
    act(() => media.resize(PHONE_WIDTH));
    expect(document.title).toBe("Home · Acme · Halonic");
    tapPlace("More");
    expect(document.title).toBe("More · Acme · Halonic");
    act(() => media.resize(DESKTOP_WIDTH));
    expect(document.title).toBe("Support reply · Acme · Halonic");
  });
});
