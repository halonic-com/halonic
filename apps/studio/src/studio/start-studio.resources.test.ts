// @vitest-environment jsdom

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

/** What the shell's `resource_report` answers: 230 MB used, 48 GB free. */
const resourceReport = {
  engineMemoryBytes: 230 * 1024 ** 2,
  childProcesses: [],
  dataBytes: 5 * 1024 ** 2,
  freeDiskBytes: 48 * 1024 ** 3,
};

/** The desktop app's webview: Tauri's IPC answering `pick_folder`, `resource_report` and the rest. */
function desktopWebview(picked: string | null) {
  const commands: string[] = [];
  const invoke = async (command: string) => {
    commands.push(command);
    if (command === "pick_folder") return picked;
    if (command === "resource_report") return resourceReport;
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list") return [];
    if (command === "host_settings_read") return {};
    return command === "run_logs" ? [] : null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { commands, page: { __TAURI_INTERNALS__: internals } };
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

verifies("studio.entry", () => {
  it("shows the resources item in the status bar of an opened folder (HAL-11118)", async () => {
    const webview = desktopWebview("/work/acme");
    started = startStudio({
      element,
      window: webview.page,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: memoryStorage(),
    });
    await vi.waitFor(() => expect(element.querySelector("button")).not.toBeNull());

    element.querySelector("button")?.click();

    await vi.waitFor(() => expect(element.textContent).toContain("230 MB · 48 GB free"), {
      timeout: 4_000,
    });
    expect(webview.commands).toContain("resource_report");
  });

  it("shows no resources item in the status bar of the served Studio (HAL-11118)", async () => {
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      fetch: async () => Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" }),
    });
    await vi.waitFor(() => expect(element.querySelector("button")).not.toBeNull());

    // The resources item is the only status bar text with a tooltip about memory or free disk.
    expect(element.querySelector('[title*="of memory"], [title*="free on this disk"]')).toBeNull();
    expect(element.textContent).not.toContain(" free");
  });
});
