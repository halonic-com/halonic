// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** Welcome's **Open folder**, which no longer comes first once the app gives Welcome the demo. */
function openFolderButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith("Open folder"),
  );
}

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

/** The desktop app's webview: Tauri's IPC answering `pick_folder` with a folder, and no data. */
function desktopWebview() {
  const invoke = async (command: string) => {
    if (command === "pick_folder") return "/work/acme";
    if (command === "resource_report") {
      return { engineMemoryBytes: 0, childProcesses: [], dataBytes: 0, freeDiskBytes: 0 };
    }
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list" || command === "run_logs") return [];
    if (command === "host_settings_read") return {};
    return null;
  };
  return {
    __TAURI_INTERNALS__: { invoke, transformCallback: () => 1, unregisterCallback: () => {} },
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/** jsdom has `<dialog>` but no `showModal()` or `close()`; some pages open one as they draw. */
function fakeModalDialogs(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const original = {
    showModal: Object.getOwnPropertyDescriptor(prototype, "showModal"),
    close: Object.getOwnPropertyDescriptor(prototype, "close"),
  };
  const fakes = {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  };
  for (const [name, value] of Object.entries(fakes)) {
    Object.defineProperty(prototype, name, { configurable: true, value });
  }
  return () => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor === undefined) Reflect.deleteProperty(prototype, name);
      else Object.defineProperty(prototype, name, descriptor);
    }
  };
}

const placeLinks = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Places"] a'),
];

const stopped = (root: HTMLElement) =>
  root.textContent?.includes("This page stopped working") === true;

let element: HTMLDivElement;
let started: StartedStudio | undefined;
let restoreDialogs: () => void;

beforeEach(() => {
  restoreDialogs = fakeModalDialogs();
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
  restoreDialogs();
});

verifies("studio.entry", () => {
  // The shell only lets a feature look up the services it lists, so a page that looks up one
  // more stops working in the real app while its package tests pass (HAL-11189).
  it("opens every place in the sidebar of a desktop folder without a page stopping", async () => {
    started = startStudio({
      element,
      window: desktopWebview(),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: memoryStorage(),
    });
    await vi.waitFor(() => expect(element.querySelector("button")).not.toBeNull());
    openFolderButton(element)?.click();
    await vi.waitFor(() => expect(placeLinks(element).length).toBeGreaterThan(0), {
      timeout: 4_000,
    });

    const labels = placeLinks(element).map((link) => link.textContent ?? "");
    for (const label of labels) {
      const link = placeLinks(element).find((candidate) => candidate.textContent === label);
      link?.click();
      await vi.waitFor(
        () => expect(element.querySelector('[aria-current="page"]')?.textContent).toBe(label),
        { timeout: 4_000 },
      );
      // Pages load on demand: wait until the page drew its heading or stopped, then tell which.
      await vi.waitFor(
        () => expect(stopped(element) || element.querySelector("main h1") !== null).toBe(true),
        { timeout: 4_000 },
      );
      expect(stopped(element), `the ${label} place stopped working`).toBe(false);
    }
    expect(labels).toEqual(expect.arrayContaining(["Inbox", "Library"]));
  }, 30_000);
});
