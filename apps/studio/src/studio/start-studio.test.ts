// @vitest-environment jsdom

import { reviewServiceKey, workspaceFilesKey } from "@halonicjs/app";
import {
  BrowserDisplayPrefs,
  DisplaySettings,
  themePref,
} from "@halonicjs/studio-feature-settings";
import {
  DisplaySettingsService,
  HostSettingsService,
} from "@halonicjs/studio-feature-settings/api";
import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { WorkspacePageService } from "@halonicjs/studio-feature-workspace/api";
import { hostSettingsStoreKey, secretsKey, tokenStoreKey } from "@halonicjs/studio-services";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  closeLimitMs,
  desktopFeatures,
  displaySettingsOf,
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
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list") return [];
    if (command === "host_settings_read") return {};
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

const acmeSettings = "id: acme\nname: Acme\n";

verifies("studio.workspace-trust", () => {
  it("names an opened workspace from workspace.yaml, and does not trust it until a person does", async () => {
    const calls: string[] = [];
    const answers: Record<string, unknown> = {
      fs_list: ["workspace.yaml"],
      folder_location: "/work/acme",
      folder_entries: [],
      host_settings_read: {},
    };
    const invoke = async (command: string, args?: Record<string, unknown>) => {
      calls.push(command);
      if (command === "fs_read") return args?.["path"] === "workspace.yaml" ? acmeSettings : null;
      return answers[command] ?? null;
    };
    const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });

    const opened = await openFolder(
      shell,
      { __TAURI_INTERNALS__: internals },
      "/work/acme",
      displaySettings(),
    );

    expect(opened.name).toBe("Acme");
    expect(calls).toContain("trust_get");
    await opened.dispose();
  });

  it("tells the workspace page the name and the trust control of the folder", async () => {
    const answers: Record<string, unknown> = {
      fs_list: ["workspace.yaml"],
      folder_location: "/work/acme",
      folder_entries: [],
      host_settings_read: {},
    };
    const invoke = async (command: string, args?: Record<string, unknown>) => {
      if (command === "fs_read") return args?.["path"] === "workspace.yaml" ? acmeSettings : null;
      return answers[command] ?? null;
    };
    const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
    const shell = createShell({
      features: [],
      hostServices: [WorkspacePageService],
      host: "desktop-app",
      platform: "windows",
    });

    const opened = await openFolder(
      shell,
      { __TAURI_INTERNALS__: internals },
      "/work/acme",
      displaySettings(),
    );

    const page = opened.workspace.services.get(WorkspacePageService);
    expect(page.name).toBe("Acme");
    expect(page.trust).toBe(opened.trust);
    await opened.dispose();
  });
});

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
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    await opened.workspace.services.get(secretsKey).get("openai");
    expect(opened.workspace.services.has(tokenStoreKey)).toBe(true);
    expect(webview.calls.at(-1)?.args).toEqual({ name: "openai" });
    expect(opened.name).toBe("acme");
    await opened.dispose();
  });

  it("opens the folder as a workspace scope over the shell's files", async () => {
    const webview = desktopWebview(null);
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    await opened.workspace.services.get(workspaceFilesKey).read("workspace.yaml");
    expect(opened.workspace.services.has(reviewServiceKey)).toBe(true);

    expect(webview.calls.find((call) => call.command === "fs_read")?.args).toEqual({
      workspace: "/work/acme",
      path: "workspace.yaml",
    });
    await opened.dispose();
  });

  it("saves an opened workspace's changes through the shell and reports them in its save note", async () => {
    const webview = desktopWebview(null);
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    opened.workspace.services.get(workspaceFilesKey).change("Added a note", { "note.txt": "hi" });
    expect(await opened.saving?.saveNow()).toBe(true);

    expect(webview.calls.find((call) => call.command === "fs_write")?.args).toMatchObject({
      workspace: "/work/acme",
      path: "note.txt",
    });
    expect(opened.workspace.saving.note).toEqual({ kind: "saved" });
    await opened.dispose();
  });

  it("gives an opened workspace the profile's host settings through the shell", async () => {
    const webview = desktopWebview(null);
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    await opened.workspace.services.get(hostSettingsStoreKey).remove("assistant.turn-limit");
    expect(webview.calls).toContainEqual({
      command: "host_settings_remove",
      args: { key: "assistant.turn-limit" },
    });
    await opened.dispose();
  });

  it("gives every folder open in a window the same loaded host settings", async () => {
    const webview = desktopWebview(null);
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const first = await openFolder(shell, webview.page, "/work/acme", displaySettings());
    const reads = () => webview.calls.filter((call) => call.command === "host_settings_read");
    const readsBefore = reads().length;
    const second = await openFolder(shell, webview.page, "/work/beta", displaySettings());

    const settings = first.workspace.services.get(HostSettingsService);
    expect(second.workspace.services.get(HostSettingsService)).toBe(settings);
    expect(() =>
      settings.get({
        key: "x",
        fallback: 1,
        accepts: (value): value is number => typeof value === "number",
      }),
    ).not.toThrow();
    expect(readsBefore).toBeGreaterThan(0);
    expect(reads()).toHaveLength(readsBefore);
    await first.dispose();
    await second.dispose();
  });
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
      desktopFeatures,
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
      "acme, Workspace settings",
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
    const opened = await openFolder(shell, desktopWebview(null).page, "/work/acme", display);

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

verifies("studio.window-appearance", () => {
  it("fails a save on a page without storage, so Settings says it and puts the value back", async () => {
    const settings = displaySettingsOf({ window: new EventTarget() });
    const outcome = await settings.set(themePref, "dark");

    expect(outcome).toMatchObject({ saved: false, superseded: false, back: "system" });
    expect(settings.get(themePref)).toBe("system");
  });
});

/** Display settings over storage of their own, as the desktop app makes one per window. */
function displaySettings(): DisplaySettings {
  return new DisplaySettings(new BrowserDisplayPrefs(memoryStorage(), new EventTarget()));
}

/** A desktop window whose close button can be pressed; `hang` makes the shell's unlisten never answer. */
function closableWebview(hang = false) {
  const { calls, page } = desktopWebview(null);
  const callbacks: ((message: unknown) => void)[] = [];
  const internals = {
    ...page.__TAURI_INTERNALS__,
    invoke: async (command: string, args?: Record<string, unknown>) => {
      if (command === "plugin:event|unlisten" && hang) return new Promise<never>(() => {});
      return page.__TAURI_INTERNALS__.invoke(command, args);
    },
    transformCallback: (callback: (message: unknown) => void) => callbacks.push(callback),
  };
  const destroyed = () => calls.filter((call) => call.command === "plugin:window|destroy");
  return {
    calls,
    page: { __TAURI_INTERNALS__: internals },
    destroyed,
    press: () => callbacks[0]?.({}),
  };
}

verifies("studio.entry", () => {
  it("stops the Studio, then closes the desktop window, when the person closes it", async () => {
    const webview = closableWebview();
    started = startStudio({ element, window: webview.page, userAgent: "Mozilla/5.0 (X11; Linux)" });
    await vi.waitFor(() => expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio"));

    webview.press();

    await vi.waitFor(() => expect(webview.destroyed()).toHaveLength(1));
    expect(element.querySelector("h1")).toBeNull();
    expect(webview.calls.map((call) => call.command)).toContain("plugin:event|unlisten");
  });

  it("closes the window anyway when stopping takes longer than the limit", async () => {
    vi.useFakeTimers();
    try {
      const webview = closableWebview(true);
      started = startStudio({
        element,
        window: webview.page,
        userAgent: "Mozilla/5.0 (X11; Linux)",
      });
      webview.press();
      await vi.advanceTimersByTimeAsync(closeLimitMs - 1);
      expect(webview.destroyed()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(webview.destroyed()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      started = undefined;
    }
  });
});
