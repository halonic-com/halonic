// @vitest-environment jsdom

import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusedOpenLimitMs } from "./start-focused-app.ts";
import { type StartedStudio, startStudio } from "./start-studio.ts";

// HAL-20489: in Preview .438, Halonic Messenger and Halonic Inbox stayed on the page's own
// "Starting Halonic…" text, because their window was drawn only once its workspace had opened.

const pageText = "Starting Halonic…";
const opening = "Reading the workspace…";
const noWorkspace = "Open Halonic to choose a workspace.";

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

/**
 * The webview of the window labelled `label`, whose shell answers `slow` only with `answer`, which
 * by default never comes.
 */
function webviewLabelled(
  label: string,
  slow: string,
  answer: Promise<unknown> = new Promise(() => undefined),
) {
  const invoke = (command: string) => {
    if (command === slow) return answer;
    if (command === "host_settings_read") return Promise.resolve({});
    if (command === "fs_list" || command === "run_logs") return Promise.resolve([]);
    return Promise.resolve(null);
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
function storageWithAcme() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
  return storage;
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  // As studio.html leaves it until the window draws.
  element.textContent = pageText;
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

verifies("studio.focused-app-start", () => {
  it("draws the Messenger's window at once while the shell doesn't answer", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    started = startStudio({
      element,
      window: webviewLabelled("messenger", "window_content_get"),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: storageWithAcme(),
    });

    await vi.waitFor(() =>
      expect(element.querySelector('[data-focused-app="messenger"]')).not.toBeNull(),
    );
    expect(element.textContent).not.toContain(pageText);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(element.textContent).toContain(opening));
    expect(element.textContent).not.toContain(noWorkspace);
  });

  it("says to open Halonic once the workspace hasn't opened in a minute", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    started = startStudio({
      element,
      window: webviewLabelled("inbox", "window_content_get"),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: storageWithAcme(),
    });
    await vi.waitFor(() =>
      expect(element.querySelector('[data-focused-app="inbox"]')).not.toBeNull(),
    );

    await vi.advanceTimersByTimeAsync(focusedOpenLimitMs);

    await vi.waitFor(() => expect(element.textContent).toContain(noWorkspace));
    const said = errors.mock.calls.map((call) => String(call[0]));
    expect(said).toContain(
      `The focused app's workspace hasn't opened after ${focusedOpenLimitMs} ms.`,
    );
  });

  it("shows the Messenger for a workspace that opens after the minute", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let answer: (content: null) => void = () => undefined;
    const late = new Promise<null>((resolve) => {
      answer = resolve;
    });
    started = startStudio({
      element,
      window: webviewLabelled("messenger", "window_content_get", late),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: storageWithAcme(),
    });
    await vi.advanceTimersByTimeAsync(focusedOpenLimitMs);
    await vi.waitFor(() => expect(element.textContent).toContain(noWorkspace));

    answer(null);

    await vi.waitFor(
      () => expect(element.querySelector('nav[aria-label="Messenger"]')).not.toBeNull(),
      { timeout: 15_000 },
    );
    expect(element.textContent).not.toContain(noWorkspace);
  }, 30_000);
});
