// @vitest-environment jsdom

import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { DisplaySettingsService } from "@halonicjs/studio-feature-settings/api";
import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { hostSettingsStoreKey, secretsKey, tokenStoreKey } from "@halonicjs/studio-services";
import { createShell, defineFeature } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  desktopFeatures,
  keyboardPlatform,
  openFolder,
  type StartedStudio,
  servedServices,
  startStudio,
  studioHost,
} from "./start-studio.ts";

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

/** The window's tabs and its heading, which React draws in the same pass. */
const tabsSelector = '[role="tablist"][aria-label="Open tabs"]';
const headingSelector = "main h1";

/**
 * Waits until React has drawn the window's tabs and heading. React draws on its own schedule,
 * so a fixed wait is too short when CI is busy; this polls until both are there instead. The
 * ceiling stays under Vitest's 5 s test timeout, so a window that never draws fails on the
 * assertion and not on "Test timed out".
 */
async function drawn(root: HTMLElement): Promise<void> {
  await vi.waitFor(
    () => {
      expect(root.querySelector(tabsSelector)).not.toBeNull();
      expect(root.querySelector(headingSelector)).not.toBeNull();
    },
    { timeout: 4_000 },
  );
}

/**
 * jsdom has `<dialog>` but no `showModal()` or `close()`; Settings needs them to open and close.
 * Returns a function that puts the originals back.
 */
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
  it("shows the window tabs and Home, as the served Studio in a browser", async () => {
    started = startStudio({ element, window, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    await drawn(element);

    expect(started.host).toBe("served");
    expect(element.querySelector(tabsSelector)).not.toBeNull();
    expect(element.querySelector(headingSelector)?.textContent).toBe("Home");
  });

  it("keeps the served Studio's host settings in memory, as it has no shell", async () => {
    const services = servedServices();

    const store = services.get(hostSettingsStoreKey);
    await store.set("assistant.turn-limit", 20);
    expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
    await services.dispose();
  });

  it("runs as the desktop app in Tauri's webview", () => {
    const webview = { __TAURI_INTERNALS__: { invoke: async () => undefined } };

    expect(studioHost(webview)).toBe("desktop-app");
    expect(studioHost({})).toBe("served");
  });

  it("reads ⌘ on macOS and Ctrl elsewhere from the user agent", () => {
    expect(keyboardPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("macos");
    expect(keyboardPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(keyboardPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  it("takes the window off the page when stopped", async () => {
    const studio = startStudio({ element, window, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    await drawn(element);

    await studio.stop();

    expect(element.childElementCount).toBe(0);
  });
});

/**
 * The desktop app's webview: Tauri's IPC, answering `pick_folder`, the keychain, and a run
 * folder without runs.
 */
function desktopWebview(picked: string | null) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "pick_folder") return picked;
    return command === "run_logs" ? [] : null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { calls, page: { __TAURI_INTERNALS__: internals } };
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

verifies("studio.open-folder", () => {
  it("starts the desktop app on Welcome and opens the folder picked", async () => {
    const webview = desktopWebview("/work/acme");
    const storage = memoryStorage();
    started = startStudio({
      element,
      window: webview.page,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage,
    });
    await vi.waitFor(() => expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio"));
    expect(started.host).toBe("desktop-app");

    element.querySelector("button")?.click();
    await drawn(element);

    expect(webview.calls.map((call) => call.command)).toContain("pick_folder");
    const switcher = element.querySelector('button[aria-label="Workspace: acme"]');
    expect(switcher?.textContent).toContain("/work/acme");
    expect(new RecentWorkspaces(storage).list()).toEqual([
      { location: "/work/acme", name: "acme" },
    ]);
  });

  it("reopens a Recent row's folder in the shell after a restart, then shows it", async () => {
    const webview = desktopWebview(null);
    const storage = memoryStorage();
    new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
    started = startStudio({
      element,
      window: webview.page,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage,
    });
    await vi.waitFor(() => expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio"));

    const row = [...element.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("/work/acme"),
    );
    row?.click();
    await drawn(element);

    expect(webview.calls.find((call) => call.command === "reopen_folder")?.args).toEqual({
      location: "/work/acme",
    });
    expect(element.querySelector('button[aria-label="Workspace: acme"]')).not.toBeNull();
  });

  it("gives an opened workspace the keychain as its secrets, before its features' services", async () => {
    const webview = desktopWebview(null);
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const opened = openFolder(shell, webview.page, "/work/acme", displaySettings());

    await opened.workspace.services.get(secretsKey).get("openai");
    expect(opened.workspace.services.has(tokenStoreKey)).toBe(true);
    expect(webview.calls.at(-1)?.args).toEqual({ name: "openai" });
    expect(opened.name).toBe("acme");
    await opened.dispose();
  });

  it("gives an opened workspace the profile's host settings through the shell", async () => {
    const webview = desktopWebview(null);
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const opened = openFolder(shell, webview.page, "/work/acme", displaySettings());

    await opened.workspace.services.get(hostSettingsStoreKey).remove("assistant.turn-limit");
    expect(webview.calls.at(-1)).toEqual({
      command: "host_settings_remove",
      args: { key: "assistant.turn-limit" },
    });
    await opened.dispose();
  });
});

/** A host section, as the Agent sandbox is: saved on this computer, not in the workspace. */
const sandboxFeature = defineFeature({
  id: "sandbox",
  title: "Agent sandbox",
  register(studio) {
    studio.settings.add({
      id: "agent-sandbox",
      title: "Agent sandbox",
      scope: "host",
      order: 40,
      view: "SandboxSection",
      load: async () => ({ SandboxSection: () => "Ready" }),
    });
  },
});

verifies("studio.settings", () => {
  it("opens Settings on Ctrl , with Appearance and a host section under On this computer", async () => {
    started = startStudio(
      {
        element,
        window: desktopWebview("/work/acme").page,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        storage: memoryStorage(),
      },
      { ...desktopFeatures, features: [...desktopFeatures.features, sandboxFeature] },
    );
    await vi.waitFor(() => expect(element.querySelector("button")).not.toBeNull());
    element.querySelector("button")?.click();
    await drawn(element);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", code: "Comma", ctrlKey: true, bubbles: true }),
    );

    await vi.waitFor(() => {
      expect(document.querySelector("dialog[open] section h3")?.textContent).toBe("Appearance");
    });
    const nav = document.querySelector("dialog[open] nav");
    expect([...(nav?.querySelectorAll("h3") ?? [])].map((h) => h.textContent)).toEqual([
      "On this computer",
    ]);
    expect(nav?.textContent).toContain("Agent sandbox");
    expect(nav?.querySelector('[aria-current="page"]')?.textContent).toBe("Appearance");
  });

  it("registers Settings and its command in the desktop app", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    expect(shell.features.map((feature) => feature.id)).toContain("settings");
    expect(shell.contributions.commands.get("settings.open")?.title).toBe("Settings");
  });
});

verifies("studio.window-appearance", () => {
  it("gives an opened workspace the window's display settings", async () => {
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const display = displaySettings();
    const opened = openFolder(shell, desktopWebview(null).page, "/work/acme", display);

    expect(opened.workspace.services.get(DisplaySettingsService)).toBe(display);
    await opened.dispose();
  });

  it("shows the window's stored Appearance on the page, for every folder open in it", async () => {
    const storage = memoryStorage();
    storage.setItem("halonic.settings.appearance.theme", JSON.stringify("dark"));
    started = startStudio({
      element,
      window: desktopWebview("/work/acme").page,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage,
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
  });
});

/** Display settings over storage of their own, as the desktop app makes one per window. */
function displaySettings(): DisplaySettings {
  return new DisplaySettings(new BrowserDisplayPrefs(memoryStorage(), new EventTarget()));
}
