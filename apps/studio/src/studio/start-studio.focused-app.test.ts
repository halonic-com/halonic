// @vitest-environment jsdom

import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { OpenExternal } from "@halonicjs/studio-kit";
import type { FocusedWindowProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** Every set of props a focused app's window was drawn with, in order. */
const focusedWindowsDrawn = vi.hoisted((): FocusedWindowProps[] => []);
/** The `openExternal` each focused app's window was mounted with. */
const focusedOpeners = vi.hoisted((): (OpenExternal | undefined)[] => []);

// The shell's own focused window, recording what it's drawn with: the region format reaches the
// app's times only through these props (`kit.time-stamp`).
vi.mock("@halonicjs/studio-shell", async (importOriginal) => {
  const shell = await importOriginal<typeof import("@halonicjs/studio-shell")>();
  return {
    ...shell,
    mountFocusedWindow: (element: Element, props: FocusedWindowProps, open?: OpenExternal) => {
      focusedWindowsDrawn.push(props);
      focusedOpeners.push(open);
      const mounted = shell.mountFocusedWindow(element, props, open);
      return {
        unmount: () => mounted.unmount(),
        update: (next: FocusedWindowProps) => {
          focusedWindowsDrawn.push(next);
          mounted.update(next);
        },
      };
    },
  };
});

/** A desktop window: jsdom has no `matchMedia`, and the shell follows the phone width with it. */
function desktopMediaQueries(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

/** The desktop app's webview in the window the shell labelled `label`, over the Acme folder. */
function webviewLabelled(label: string, called: string[] = [], region?: string) {
  const invoke = async (command: string) => {
    called.push(command);
    if (command === "system_region") return region ?? null;
    if (command === "resource_report") {
      return { engineMemoryBytes: 0, childProcesses: [], dataBytes: 0, freeDiskBytes: 0 };
    }
    if (command === "fs_list" || command === "run_logs") return [];
    if (command === "host_settings_read") return {};
    return null;
  };
  return {
    __TAURI_INTERNALS__: {
      invoke,
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: { currentWindow: { label } },
    },
  };
}

/** Storage with Acme first in Recent, as Studio leaves it once it opened Acme. */
function storageWithAcme(remembered: boolean) {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  if (remembered) new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
  return storage;
}

const studioFrame = (root: HTMLElement) =>
  root.querySelector('[role="tablist"][aria-label="Open tabs"]') !== null ||
  root.querySelector('nav[aria-label="Places"]') !== null ||
  root.textContent?.includes("Halonic Studio") === true;

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
  focusedWindowsDrawn.length = 0;
  focusedOpeners.length = 0;
});

function start(label: string, remembered = true, called: string[] = [], region?: string) {
  started = startStudio({
    element,
    window: webviewLabelled(label, called, region),
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    storage: storageWithAcme(remembered),
  });
}

verifies("studio.focused-app-window", () => {
  it("shows only the Inbox, for the last workspace, in the window labelled inbox", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    start("inbox");

    await vi.waitFor(() => expect(element.querySelector("main h1")?.textContent).toBe("Inbox"), {
      timeout: 15_000,
    });
    expect(element.querySelector('[data-focused-app="inbox"]')).not.toBeNull();
    expect(studioFrame(element)).toBe(false);
    expect(document.title).toBe("Inbox · acme · Halonic Inbox");
    // Studio's window opens the engine for the routines; the engine lock is held per window.
    const said = errors.mock.calls.map((call) => String(call[0]));
    expect(said).not.toContain("The engine didn't open for the routines");
    vi.restoreAllMocks();
  }, 30_000);

  it("opens the Inbox's outside pages through the page's location, as Studio's window does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const asked: string[] = [];
    const location = { origin: "tauri://localhost", assign: (url: string) => asked.push(url) };
    started = startStudio({
      element,
      window: { ...webviewLabelled("inbox"), location },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: storageWithAcme(true),
    });
    await vi.waitFor(() => expect(focusedOpeners).toHaveLength(1), { timeout: 15_000 });

    await focusedOpeners[0]?.("https://paperclip.acme.example/approve");

    expect(asked).toEqual(["https://paperclip.acme.example/approve"]);
    vi.restoreAllMocks();
  }, 30_000);

  it("shows only the Messenger in the window labelled messenger", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    start("messenger");

    await vi.waitFor(
      () => expect(element.querySelector('nav[aria-label="Messenger"]')).not.toBeNull(),
      {
        timeout: 15_000,
      },
    );
    expect(element.querySelector('[data-focused-app="messenger"]')).not.toBeNull();
    expect(studioFrame(element)).toBe(false);
    vi.restoreAllMocks();
  }, 30_000);

  it("says to open Halonic when Recent has no workspace", async () => {
    start("inbox", false);

    await vi.waitFor(() =>
      expect(element.textContent).toContain("Open Halonic to choose a workspace."),
    );
    expect(studioFrame(element)).toBe(false);
  });

  it("brings Studio's window forward from the Open Halonic button with no workspace", async () => {
    const called: string[] = [];
    start("messenger", false, called);

    const button = await vi.waitFor(() => {
      const found = [...element.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === "Open Halonic",
      );
      if (found === undefined) throw new Error("No Open Halonic button yet.");
      return found;
    });
    expect(called).not.toContain("show_main_window");
    button.click();
    expect(called.filter((command) => command === "show_main_window")).toHaveLength(1);
  });

  it("still shows Studio in Studio's own window", async () => {
    start("main", false);

    await vi.waitFor(() => expect(element.textContent).toContain("Halonic Studio"));
    expect(element.querySelector("[data-focused-app]")).toBeNull();
  });
});

verifies("kit.time-stamp", () => {
  it("gives the Messenger's window the system's region format for its times", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    start("messenger", true, [], "en_GB.UTF-8");

    await vi.waitFor(() => expect(focusedWindowsDrawn.at(-1)?.regionFormat).toBe("en_GB.UTF-8"), {
      timeout: 15_000,
    });
    expect(focusedWindowsDrawn.at(-1)?.app.id).toBe("messenger");
    vi.restoreAllMocks();
  }, 30_000);

  it("leaves the Messenger's window on the browser's language when the system names no region", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const called: string[] = [];
    start("messenger", true, called);

    await vi.waitFor(
      () => expect(element.querySelector('nav[aria-label="Messenger"]')).not.toBeNull(),
      {
        timeout: 15_000,
      },
    );
    expect(called).toContain("system_region");
    expect(focusedWindowsDrawn.every((props) => props.regionFormat === undefined)).toBe(true);
    vi.restoreAllMocks();
  }, 30_000);

  it("gives the Messenger's window the format chosen in Settings → Formats", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = storageWithAcme(true);
    storage.setItem("halonic.settings.formats.format", JSON.stringify("de-DE"));
    started = startStudio({
      element,
      window: webviewLabelled("messenger", [], "en_US.UTF-8"),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage,
    });

    await vi.waitFor(() => expect(focusedWindowsDrawn.at(-1)?.chosenFormat?.get()).toBe("de-DE"), {
      timeout: 15_000,
    });
    vi.restoreAllMocks();
  }, 30_000);
});
