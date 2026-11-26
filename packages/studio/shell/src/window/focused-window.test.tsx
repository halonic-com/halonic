// @vitest-environment jsdom

import { ExternalLink, type OpenExternal, TimeStamp, useNarrow } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import type { FocusedAppContribution } from "../points/frame.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { FakeChosenFormat } from "../test-support/fake-chosen-format.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { focusedWindowTitle, mountFocusedWindow } from "./focused-window.tsx";
import type { PlaceViewProps } from "./studio-page.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let media: FakeMediaQueries;
let restoreMedia: () => void;
let element: HTMLDivElement;

beforeEach(() => {
  media = new FakeMediaQueries(1280);
  restoreMedia = media.install();
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  element.remove();
  restoreMedia();
  vi.restoreAllMocks();
});

/**
 * The Acme Inbox's view: it names the feature whose context it got, and shows one pane in a narrow
 * window, as the Messenger and the Inbox do.
 */
function AcmeInbox({ context }: PlaceViewProps) {
  const panes = useNarrow() ? 1 : 2;
  return <h1 data-panes={panes}>{`Inbox for ${String(context.host)}`}</h1>;
}

const inboxApp: FocusedAppContribution = {
  id: "inbox",
  title: "Inbox",
  view: "AcmeInbox",
  load: async () => ({ AcmeInbox }),
  panel: true,
};

function shellWith(app: FocusedAppContribution) {
  const feature = defineFeature({
    id: "acme-inbox",
    title: "Acme Inbox",
    register: (studio) => studio.focusedApps.add(app),
  });
  return createShell({ features: [feature], timers: new FakeTimers() });
}

async function mount(
  name: string | undefined,
  shown: FocusedAppContribution = inboxApp,
  regionFormat?: string,
  chosenFormat?: FakeChosenFormat,
  openExternal?: OpenExternal,
) {
  const shell = shellWith(shown);
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace =
    name === undefined ? undefined : new StudioWorkspace({ toasts: shell.toasts, services, name });
  const [app] = shell.contributions.focusedApps.list();
  if (app === undefined) throw new Error("The Acme Inbox added no focused app.");
  let focused: ReturnType<typeof mountFocusedWindow> | undefined;
  const studioShown: number[] = [];
  const openStudio = () => studioShown.push(1);
  await act(async () => {
    focused = mountFocusedWindow(
      element,
      {
        shell,
        app,
        workspace,
        language: "en",
        regionFormat,
        chosenFormat,
        openStudio,
      },
      openExternal,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { studioShown, unmount: () => act(() => focused?.unmount()) };
}

verifies("shell.focused-apps", () => {
  it("shows only the app's view, in the frame's panel, with none of Studio's tabs or places", async () => {
    const focused = await mount("Acme");

    expect(element.querySelector("main h1")?.textContent).toBe("Inbox for desktop-app");
    expect(element.querySelector('[data-focused-app="inbox"]')?.classList).toContain(
      "bg-app-frame",
    );
    expect(element.querySelector('[role="tablist"]')).toBeNull();
    expect(element.querySelector('nav[aria-label="Places"]')).toBeNull();
    expect(document.title).toBe("Inbox · Acme · Halonic Inbox");
    focused.unmount();
    expect(element.childElementCount).toBe(0);
  });

  it("draws a floating app, quick ask's box, on the see-through window with no frame or panel", async () => {
    await mount("Acme", {
      ...inboxApp,
      id: "ask",
      title: "Ask an agent",
      panel: false,
      floating: true,
    });
    const window = element.querySelector('[data-focused-app="ask"]');

    expect(window?.className).not.toContain("bg-app-frame");
    expect(window?.className).not.toContain("p-2");
    expect(element.querySelector("main")).toBeNull();
    expect(element.querySelector("h1")?.textContent).toBe("Inbox for desktop-app");
  });

  it("shows its app in one pane in a window 640px wide, and in two once it's widened", async () => {
    media.resize(640);
    await mount("Acme");
    const panes = () => element.querySelector("main h1")?.getAttribute("data-panes");

    expect(panes()).toBe("1");
    act(() => media.resize(1280));
    expect(panes()).toBe("2");
  });

  it("says to open Halonic while there is no workspace", async () => {
    await mount(undefined);

    expect(element.textContent).toContain("Open Halonic to choose a workspace.");
    expect(document.title).toBe("Inbox · Halonic Inbox");
  });

  it("brings Studio's window forward from its Open Halonic button while there is no workspace", async () => {
    const focused = await mount(undefined);
    const buttons = [...element.querySelectorAll("button")];

    expect(buttons.map((button) => button.textContent)).toEqual(["Open Halonic"]);
    act(() => buttons[0]?.click());
    expect(focused.studioShown).toHaveLength(1);
  });

  it("has no Open Halonic button once a workspace is open", async () => {
    await mount("Acme");

    expect(element.textContent).not.toContain("Open Halonic");
  });

  it("names the app's page, the workspace and the app in the title", () => {
    expect(focusedWindowTitle("Messenger", "Acme")).toBe("Messenger · Acme · Halonic Messenger");
    expect(focusedWindowTitle("Messenger", " ")).toBe("Messenger · Halonic Messenger");
  });

  it("refuses a focused app Halonic doesn't start, naming the feature", () => {
    const runs = { ...inboxApp, id: "runs" } as unknown as FocusedAppContribution;

    expect(() => shellWith(runs)).toThrow(ShellError);
    expect(() => shellWith(runs)).toThrow(/"acme-inbox" adds the focused app "runs"/);
  });

  it("refuses the same focused app from two features", () => {
    const twice = (id: string) =>
      defineFeature({ id, title: id, register: (studio) => studio.focusedApps.add(inboxApp) });

    expect(() => createShell({ features: [twice("one"), twice("two")] })).toThrow(ShellError);
  });
});

/** The Acme Messenger's view: one chat row's time, 09:41 today, with no locale of its own. */
function AcmeMessenger() {
  return <TimeStamp at={new Date(2026, 10, 26, 9, 41)} now={new Date(2026, 10, 26, 12, 0)} />;
}

const messengerApp: FocusedAppContribution = {
  id: "messenger",
  title: "Messenger",
  view: "AcmeMessenger",
  load: async () => ({ AcmeMessenger }),
  panel: true,
};

verifies("kit.time-stamp", () => {
  it("gives the focused app's times the system's region format, over the browser's language", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    await mount("Acme", messengerApp, "en_GB.UTF-8");

    expect(element.querySelector("time")?.textContent).toBe("09:41");
  });

  it("follows the browser's language in a focused app with no region format", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    await mount("Acme", messengerApp);

    expect(element.querySelector("time")?.textContent).toBe("9:41 AM");
  });

  it("follows the format chosen in Settings → Formats over the region, and a new choice at once", async () => {
    const chosen = new FakeChosenFormat("en-GB");
    await mount("Acme", messengerApp, "en_US.UTF-8", chosen);
    expect(element.querySelector("time")?.textContent).toBe("09:41");

    act(() => chosen.choose(undefined));
    expect(element.querySelector("time")?.textContent).toBe("9:41 AM");
  });
});

/** The Acme Messenger's chat: one reply with a link to a Paperclip task. */
function AcmeChat() {
  return <ExternalLink href="https://paperclip.example/ACME/issues/ACME-7">ACME-7</ExternalLink>;
}

const chatApp: FocusedAppContribution = {
  id: "messenger",
  title: "Messenger",
  view: "AcmeChat",
  load: async () => ({ AcmeChat }),
  panel: true,
};

verifies("kit.external-link", () => {
  // In the desktop app a new tab goes nowhere, so a link that fell back to one did nothing (HAL-19406).
  it("opens a link in the focused app through the openExternal it was given, not a new tab", async () => {
    const opened: string[] = [];
    const openExternal: OpenExternal = async (address) => {
      opened.push(await address);
    };
    const newTab = vi.spyOn(window, "open").mockReturnValue(null);
    await mount("Acme", chatApp, undefined, undefined, openExternal);

    await act(async () => element.querySelector("a")?.click());

    expect(opened).toEqual(["https://paperclip.example/ACME/issues/ACME-7"]);
    expect(newTab).not.toHaveBeenCalled();
  });

  it("opens a link in a new tab when it was given no openExternal", async () => {
    const newTab = vi.spyOn(window, "open").mockReturnValue(null);
    await mount("Acme", chatApp);

    act(() => element.querySelector("a")?.click());

    expect(newTab).toHaveBeenCalledWith(
      "https://paperclip.example/ACME/issues/ACME-7",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
