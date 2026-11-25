// @vitest-environment jsdom

import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

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
function webviewLabelled(label: string, called: string[] = []) {
  const invoke = async (command: string) => {
    called.push(command);
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
});

function start(label: string, remembered = true, called: string[] = []) {
  started = startStudio({
    element,
    window: webviewLabelled(label, called),
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
